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
  const config = loadConfig();

  const requestBody: any = {
    model: model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an automated Photo Renamer. Given an image, your ONLY task is to return a descriptive filename.
Rules:
1. ONLY return the descriptive slug (e.g., white-cat-on-mat).
2. NO conversational text, NO "The image shows...", NO "Filename:".
3. NO markdown, NO extensions, NO spaces.
4. Use lowercase, numbers, and dashes.
5. Maximum 6 words.
6. If the image is unclear, describe what IS visible rather than saying "unknown".

Provide a short, descriptive filename for this image.`
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
    requestBody.max_completion_tokens = 60;
  } else {
    requestBody.max_tokens = 60;
  }

  // Retry logic for Rate Limits (429)
  let response;
  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    try {
      response = await client.chat.completions.create(requestBody);
      break; 
    } catch (error: any) {
      if (error.status === 429 && retries < maxRetries) {
        const delay = Math.pow(2, retries) * 2000; // 2s, 4s, 8s
        retries++;
        console.log(`\n⚠️ Rate limited. Retrying in ${delay/1000}s... (Attempt ${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }

  if (!response) {
     throw new Error("Failed to get response after retries.");
  }

  const raw = response.choices[0]?.message?.content?.trim() || '';
  if (!raw) return 'unknown-image';

  // Heuristic: Some models return "Filename: white-cat.jpg" or "Slug: white-cat"
  // Let's strip common prefixes and conversational openers
  let cleaned = raw
    .replace(/^(filename|slug|name|result|output|here is a filename)[^a-z0-9]*/i, '')
    .replace(/^["']|["']$/g, ''); // strip quotes

  const sanitized = cleaned
    .toLowerCase()                           // lowercase FIRST so uppercase letters aren't nuked by regex
    .replace(/\s+|_+/g, '-')                 // spaces and underscores -> dashes
    .replace(/[^a-z0-9-]/g, '')              // strip non-alphanumeric (now safe because we lowercased)
    .replace(/-+/g, '-')                     // collapse multiple dashes
    .replace(/^-|-$/g, '')                   // trim leading/trailing dashes
    .slice(0, 80);                           // cap length

  // Prevent recursive "unknown" or "image" naming loops
  const isTooGeneric = sanitized === 'unknown' || sanitized === 'image' || sanitized === 'unknown-image';

  return (sanitized && !isTooGeneric) ? sanitized : 'descriptive-photo';
}
