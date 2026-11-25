import Anthropic from "@anthropic-ai/sdk";
import { PROMPTS, type PromptVersion } from "./prompts";
import { executeTool, toolDefinitions, type AgentAction } from "./tools";

export const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

export interface AgentConfig {
  promptVersion: PromptVersion;
  enforceGuards: boolean;
}
export const CONFIGS = {
  v1: { promptVersion: "v1", enforceGuards: false }, // baseline: naive prompt, no code guards
  "v2-prompt-only": { promptVersion: "v2", enforceGuards: false }, // ablation: policy prompt, no code guards
  v2: { promptVersion: "v2", enforceGuards: true }, // policy prompt + guards in the tool layer
} satisfies Record<string, AgentConfig>;

export interface ToolTrace {
  name: string;
  input: Record<string, string>;
  output: unknown;
}

export interface TurnResult {
  messages: Anthropic.Beta.BetaMessageParam[]; // full history incl. tool calls, to send back next turn
  reply: string;
  tools: ToolTrace[];
  actions: AgentAction[];
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic());

// Runs one supplier turn: appends the user message, loops over tool calls
// until the model answers, and returns the updated history.
export async function runTurn(opts: {
  history: Anthropic.Beta.BetaMessageParam[];
  userMessage: string;
  senderEmail: string;
  config: AgentConfig;
}): Promise<TurnResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...opts.history,
    { role: "user", content: opts.userMessage },
  ];
  const ctx = { senderEmail: opts.senderEmail, enforceGuards: opts.config.enforceGuards, actions: [] as AgentAction[] };
  const tools: ToolTrace[] = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: PROMPTS[opts.config.promptVersion],
      tools: toolDefinitions,
      messages,
    });
    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") {
      return finish("I'm not able to help with that here. I can connect you with a member of our AP team if you'd like.");
    }
    if (response.stop_reason === "max_tokens") {
      return finish("Sorry, something went wrong on my side. Please try again or email our AP team.");
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return finish(textOf(response.content));
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((t) => {
      const input = (t.input ?? {}) as Record<string, string>;
      const output = executeTool(t.name, input, ctx);
      tools.push({ name: t.name, input, output });
      const isError = typeof output === "object" && output !== null && "error" in output;
      return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(output), is_error: isError };
    });
    // All results for one assistant turn go back in a single user message.
    messages.push({ role: "user", content: results });
  }

  return finish("Sorry, I couldn't finish that request. I've noted it for our AP team; please email us if it's urgent.");

  function finish(reply: string): TurnResult {
    return { messages, reply, tools, actions: ctx.actions, usage };
  }
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
