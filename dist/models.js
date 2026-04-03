/** Fetch vision-capable model IDs for the config UI (OpenRouter + OpenAI). */
function modalityHasVision(mod) {
    const s = Array.isArray(mod) ? mod.join(' ') : String(mod ?? '');
    return s.includes('image->text');
}
async function fetchOpenRouterVisionModelsList() {
    try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        if (!res.ok) {
            return {
                models: [],
                source: 'fallback',
                error: `HTTP ${res.status}`,
            };
        }
        const data = (await res.json());
        const list = (data.data ?? [])
            .filter((m) => typeof m.id === 'string' &&
            m.id.endsWith(':free') &&
            modalityHasVision(m.architecture?.modality))
            .map((m) => m.id);
        return { models: list, source: 'live' };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
            models: [
                'qwen/qwen-vl-plus:free',
                'meta-llama/llama-3.2-11b-vision-instruct:free',
                'google/gemma-3-27b-it:free',
            ],
            source: 'fallback',
            error: message,
        };
    }
}
async function fetchOpenAiVisionModelsList(apiKey) {
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
        const data = (await res.json());
        const liveModels = (data.data ?? [])
            .map((m) => m.id)
            .filter((id) => {
            if (id.includes('audio') ||
                id.includes('tts') ||
                id.includes('realtime') ||
                id.includes('embed') ||
                id.includes('moderation') ||
                id.includes('whisper') ||
                id.includes('dall-e') ||
                id.includes('instruct') ||
                id.includes('babbage') ||
                id.includes('davinci')) {
                return false;
            }
            return (id.startsWith('gpt-4o') ||
                id.startsWith('gpt-5') ||
                id.startsWith('o1') ||
                id.startsWith('o3') ||
                id.startsWith('o4'));
        })
            .sort()
            .reverse();
        return { models: liveModels, source: 'live' };
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
            models: ['gpt-5-nano-2025-08-07', 'gpt-4o', 'gpt-4o-mini'],
            source: 'fallback',
            error: message,
        };
    }
}
export async function listModelsForConfig(config) {
    if (config.provider === 'openrouter') {
        return fetchOpenRouterVisionModelsList();
    }
    return fetchOpenAiVisionModelsList(config.openaiApiKey ?? '');
}
export async function fetchOpenRouterVisionModels() {
    return (await fetchOpenRouterVisionModelsList()).models;
}
export async function fetchOpenAiVisionModels(apiKey) {
    return (await fetchOpenAiVisionModelsList(apiKey)).models;
}
