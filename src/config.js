export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-7";
export const MAX_TOKENS = Number(process.env.MAX_TOKENS ?? 2048);
export const DEFAULT_PORT = Number(process.env.PORT ?? 8765);
