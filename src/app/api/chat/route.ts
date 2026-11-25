import Anthropic from "@anthropic-ai/sdk";
import { runTurn, CONFIGS } from "@/lib/agent/agent";
import type { ApRepo } from "@/lib/agent/repo";
import { SupabaseRepo } from "@/lib/agent/repo-supabase";
import { authEnabled, createServiceClient, createUserClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 60; // API messages, including tool calls

interface ChatRequest {
  history: Anthropic.Beta.BetaMessageParam[];
  message: string;
  senderEmail: string;
}

// The live app always runs the policy prompt with code guards. The v1 baseline
// exists only for the eval runner, never behind this API.
const LIVE_CONFIG = CONFIGS.v2;

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { history = [], message, senderEmail } = body;

  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_CHARS)
    return Response.json({ error: `Message must be 1 to ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
  if (!authEnabled() && (typeof senderEmail !== "string" || !senderEmail.includes("@") || senderEmail.length > 200))
    return Response.json({ error: "A sender email is required." }, { status: 400 });
  if (!Array.isArray(history) || history.length > MAX_HISTORY)
    return Response.json({ error: "Conversation is too long. Start a new one." }, { status: 400 });

  try {
    let sender = senderEmail;
    let repo: ApRepo | undefined; // undefined = in-memory demo data
    if (authEnabled()) {
      // Identity comes from the signed-in session only. Anything in the request body is ignored.
      const userClient = await createUserClient();
      const { data } = await userClient.auth.getUser();
      if (!data.user?.email) return Response.json({ error: "Please sign in." }, { status: 401 });
      sender = data.user.email.toLowerCase();
      repo = new SupabaseRepo(userClient, createServiceClient(), LIVE_CONFIG.enforceGuards);
    }
    const result = await runTurn({ history, userMessage: message.trim(), senderEmail: sender, config: LIVE_CONFIG, repo });
    return Response.json(result);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError)
      return Response.json({ error: "The demo is busy. Try again in a minute." }, { status: 429 });
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return Response.json({ error: "The agent is unavailable right now." }, { status: 502 });
    }
    console.error(err);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
