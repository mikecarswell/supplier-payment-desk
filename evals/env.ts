// Load .env.local for eval scripts, overriding any key already in the shell,
// so the project key wins over an older global ANTHROPIC_API_KEY.
import fs from "node:fs";
import { parseEnv } from "node:util";

if (fs.existsSync(".env.local")) {
  Object.assign(process.env, parseEnv(fs.readFileSync(".env.local", "utf8")));
}
