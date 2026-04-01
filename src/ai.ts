import OpenAI from 'openai';
import { loadConfig } from './config.js';

let openaiClient: OpenAI | null = null;

export function getAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const config = loadConfig();

  if (config.provider === 'openai') {
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API Key is missing. Please set it in your configuration or run pixelphoto onboard.');
    }
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  } else {
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

export async function askVisionModel(base64Image: string, mimeType: string, model: string): Promise<string> {
  const client = getAIClient();

  const response = await client.chat.completions.create({
    model: model,
    messages: [
      {
        role: "system",
        content: "You are an automated file unnamer. Given an image, your ONLY task is to return a descriptive filename. Use ONLY lowercase characters, numbers, and dashes. NO extensions, NO markdown, NO spaces, NO other text. Example: white-cat-on-grass. Maximum 6 words."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Provide a filename for this image."
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`
            }
          }
        ]
      }
    ],
    max_tokens: 50,
  });

  const content = response.choices[0]?.message?.content?.trim() || 'unknown-image';
  return content.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'unknown-image';
}
