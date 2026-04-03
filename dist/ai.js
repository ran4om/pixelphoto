import OpenAI from 'openai';
import { loadConfig } from './config.js';
let openaiClient = null;
export function getAIClient() {
    if (openaiClient)
        return openaiClient;
    const config = loadConfig();
    if (config.provider === 'openai') {
        if (!config.openaiApiKey) {
            throw new Error('OpenAI API Key is missing. Please set it in your configuration or run pixelphoto onboard.');
        }
        openaiClient = new OpenAI({
            apiKey: config.openaiApiKey,
        });
    }
    else {
        if (!config.openrouterApiKey) {
            throw new Error('OpenRouter API Key is missing. Please set it in your configuration or run pixelphoto onboard.');
        }
        openaiClient = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: config.openrouterApiKey,
            defaultHeaders: {
                'HTTP-Referer': 'https://github.com/ran4om/pixelphoto',
                'X-Title': 'PixelPhoto AI Bulk Renamer',
            },
        });
    }
    return openaiClient;
}
export async function askVisionModel(base64Image, mimeType, model) {
    const client = getAIClient();
    const config = loadConfig();
    const requestBody = {
        model: model,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "You are an automated file unnamer. Given an image, your ONLY task is to return a descriptive filename. Use ONLY lowercase characters, numbers, and dashes. NO extensions, NO markdown, NO spaces, NO other text. Example: white-cat-on-grass. Maximum 6 words.\n\nProvide a filename for this image."
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:${mimeType};base64,${base64Image}`
                        }
                    }
                ]
            }
        ]
    };
    // https://developers.openai.com/api/docs: max_tokens is deprecated on o1/gpt-5 in favor of max_completion_tokens
    if (config.provider === 'openai') {
        requestBody.max_completion_tokens = 50;
    }
    else {
        requestBody.max_tokens = 50;
    }
    const response = await client.chat.completions.create(requestBody);
    const raw = response.choices[0]?.message?.content?.trim() || '';
    if (!raw)
        return 'unknown-image';
    const sanitized = raw
        .toLowerCase() // lowercase everything first
        .replace(/\s+|_+/g, '-') // spaces and underscores → dashes
        .replace(/[^a-z0-9-]/g, '') // strip anything remaining that isn't alphanumeric or dash
        .replace(/-+/g, '-') // collapse multiple dashes
        .replace(/^-|-$/g, '') // trim leading/trailing dashes
        .slice(0, 80); // cap length
    return sanitized || 'unknown-image';
}
