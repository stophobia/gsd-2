import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type AuthCredential =
  | { type?: unknown; key?: unknown }
  | Array<{ type?: unknown; key?: unknown }>;

type AuthStorageData = Record<string, AuthCredential>;

const TOOL_ENV_KEYS = [
  ["brave", "BRAVE_API_KEY"],
  ["brave_answers", "BRAVE_ANSWERS_KEY"],
  ["context7", "CONTEXT7_API_KEY"],
  ["jina", "JINA_API_KEY"],
  ["tavily", "TAVILY_API_KEY"],
  ["slack_bot", "SLACK_BOT_TOKEN"],
  ["discord_bot", "DISCORD_BOT_TOKEN"],
  ["telegram_bot", "TELEGRAM_BOT_TOKEN"],
  ["groq", "GROQ_API_KEY"],
  ["ollama-cloud", "OLLAMA_API_KEY"],
  ["custom-openai", "CUSTOM_OPENAI_API_KEY"],
] as const;

function expandHome(pathValue: string): string {
  if (pathValue === "~") return homedir();
  if (pathValue.startsWith("~/")) return join(homedir(), pathValue.slice(2));
  return pathValue;
}

function getStoredApiKey(data: AuthStorageData, providerId: string): string | undefined {
  const raw = data[providerId];
  const credentials = Array.isArray(raw) ? raw : raw ? [raw] : [];

  for (const credential of credentials) {
    if (credential?.type !== "api_key") continue;
    if (typeof credential.key !== "string") continue;
    if (credential.key.trim().length === 0) continue;
    return credential.key;
  }

  return undefined;
}

export function resolveAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  const agentDir = env.GSD_CODING_AGENT_DIR?.trim();
  if (agentDir) return join(expandHome(agentDir), "auth.json");
  return join(homedir(), ".gsd", "agent", "auth.json");
}

export function loadStoredToolEnvKeys(options: {
  env?: NodeJS.ProcessEnv;
  authPath?: string;
} = {}): string[] {
  const env = options.env ?? process.env;
  const authPath = options.authPath ?? resolveAuthPath(env);
  if (!existsSync(authPath)) return [];

  let parsed: AuthStorageData;
  try {
    const raw = readFileSync(authPath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return [];
    parsed = data as AuthStorageData;
  } catch {
    return [];
  }

  const loaded: string[] = [];
  for (const [providerId, envVar] of TOOL_ENV_KEYS) {
    if (env[envVar]) continue;
    const key = getStoredApiKey(parsed, providerId);
    if (!key) continue;
    env[envVar] = key;
    loaded.push(envVar);
  }

  return loaded;
}
