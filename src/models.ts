import type { AppConfig } from './config.js';

export type ModelsListResult = { models: string[]; source: 'live' | 'fallback'; error?: string };

/** Vision-capable OpenAI chat model id prefixes (last updated: 2026-04-03). */
const OPENAI_VISION_PREFIXES = ['gpt-4o', 'gpt-5', 'o1', 'o3', 'o4'] as const;

/**
 * Fetches vision-capable model IDs from OpenRouter and returns either the live list or a fallback set.
 *
 * @returns An object containing `models` (array of model ID strings), `source` — `'live'` when the OpenRouter response provided results or `'fallback'` when a built-in list is used — and an optional `error` string present when the live fetch failed or returned a non-OK HTTP status.
 */
export async function fetchOpenRouterVisionModels(): Promise<ModelsListResult> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) {
      return {
        models: [],
        source: 'fallback',
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { data?: Array<{ id: string; architecture?: { modality?: string } }> };
    const list = (data.data ?? [])
      .filter(
        m =>
          typeof m.id === 'string' &&
          m.id.endsWith(':free') &&
          (m.architecture?.modality?.includes('image->text') ?? false)
      )
      .map(m => m.id);
    return { models: list, source: 'live' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      models: ['qwen/qwen-vl-plus:free', 'meta-llama/llama-3.2-11b-vision-instruct:free', 'google/gemma-3-27b-it:free'],
      source: 'fallback',
      error: message,
    };
  }
}

/**
 * Fetches OpenAI model IDs and returns only vision-capable models, or a predefined fallback list on error or when the API key is missing.
 *
 * @param apiKey - The OpenAI API key used for the request; if empty or whitespace, the function immediately returns the fallback models with `error: 'No API key'`.
 * @returns A `ModelsListResult` containing `models` (vision-capable model IDs) and `source: 'live'` when the request succeeds; otherwise `models` contains a predefined fallback set, `source: 'fallback'`, and `error` with a short failure description (HTTP status or exception message).
 */
export async function fetchOpenAiVisionModels(apiKey: string): Promise<ModelsListResult> {
  if (!apiKey.trim()) {
    return {
      models: ['gpt-5-nano-2025-08-07', 'gpt-4o', 'gpt-4o-mini'],
      source: 'fallback',
      error: 'No API key',
    };
  }
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return {
        models: ['gpt-5-nano-2025-08-07', 'gpt-4o', 'gpt-4o-mini'],
        source: 'fallback',
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const liveModels = (data.data ?? [])
      .map(m => m.id)
      .filter((id: string) => {
        if (
          id.includes('audio') ||
          id.includes('tts') ||
          id.includes('realtime') ||
          id.includes('embed') ||
          id.includes('moderation') ||
          id.includes('whisper') ||
          id.includes('dall-e') ||
          id.includes('instruct') ||
          id.includes('babbage') ||
          id.includes('davinci')
        ) {
          return false;
        }
        return OPENAI_VISION_PREFIXES.some(prefix => id.startsWith(prefix));
      })
      .sort()
      .reverse();
    return { models: liveModels, source: 'live' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      models: ['gpt-5-nano-2025-08-07', 'gpt-4o', 'gpt-4o-mini'],
      source: 'fallback',
      error: message,
    };
  }
}

/**
 * Selects the configured provider and returns a list of vision-capable model IDs.
 *
 * If `config.provider` is `'openrouter'`, the function retrieves models from OpenRouter; otherwise it retrieves models from OpenAI using `config.openaiApiKey` when provided. On failure the result contains a predefined fallback model list and an `error` message.
 *
 * @param config - Application configuration that determines which provider to query and supplies `openaiApiKey` when using OpenAI
 * @returns An object with `models` (array of model IDs), `source` (`'live'` when fetched successfully or `'fallback'` on error), and an optional `error` message
 */
export async function listModelsForConfig(config: AppConfig): Promise<ModelsListResult> {
  if (config.provider === 'openrouter') {
    return fetchOpenRouterVisionModels();
  }
  return fetchOpenAiVisionModels(config.openaiApiKey ?? '');
}
