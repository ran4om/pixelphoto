/** Fetch vision-capable model IDs for the config UI (OpenRouter + OpenAI). */
export async function fetchOpenRouterVisionModels() {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok)
        throw new Error(`OpenRouter models HTTP ${res.status}`);
    const data = await res.json();
    const list = data.data ?? [];
    return list
        .filter((m) => {
        const mod = m.architecture?.modality;
        const modStr = Array.isArray(mod) ? mod.join(' ') : String(mod ?? '');
        return m.id.endsWith(':free') && modStr.includes('image->text');
    })
        .map((m) => m.id);
}
export async function fetchOpenAiVisionModels(apiKey) {
    const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok)
        throw new Error(`OpenAI models HTTP ${res.status}`);
    const data = await res.json();
    const ids = (data.data ?? []).map((m) => m.id);
    return ids
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
}
