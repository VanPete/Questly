export const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
export const OPENAI_MODEL = process.env.MODEL_NAME || 'gpt-4o-mini';
export const OPENAI_KEY = process.env.OPENAI_API_KEY!;

export const TEMPS = {
  explore: Number(process.env.TEMPERATURE_EXPLORE ?? '0.8'),
  strict: Number(process.env.TEMPERATURE_QUIZ ?? '0.2'),
};

export const LIMITS = {
  maxTokensChat: Number(process.env.MAX_TOKENS_CHAT ?? '700'),
  maxTokensSession: Number(process.env.MAX_TOKENS_SESSION ?? '3500'),
};