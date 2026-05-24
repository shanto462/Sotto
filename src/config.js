export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-7";
export const OPENAI_LLM_MODEL = process.env.OPENAI_LLM_MODEL ?? "gpt-4o-mini";
export const MAX_TOKENS = Number(process.env.MAX_TOKENS ?? 2048);
export const DEFAULT_PORT = Number(process.env.PORT ?? 8765);
