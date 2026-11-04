import { createOpenAI } from "@ai-sdk/openai";

/**
 * Provider OpenAI-compatible condiviso.
 * Default: Ollama locale. Per un endpoint remoto impostare AI_BASE_URL e AI_API_KEY.
 * Non usare mai qui credenziali broker o chiavi Supabase.
 */
const baseURL = (process.env["AI_BASE_URL"] || "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
const apiKey = process.env["AI_API_KEY"] || "ollama";
export const AI_MODEL = process.env["AI_MODEL"] || "qwen3:8b";

const provider = createOpenAI({
  baseURL,
  apiKey,
});

export function modelloAlthea() {
  return provider.chat(AI_MODEL);
}
