import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'node:crypto';
import { DEFAULT_RENAME_PROMPT } from './prompt-default.js';

export interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
}

export interface AppConfig {
  provider: 'openrouter' | 'openai';
  openrouterApiKey?: string;
  openaiApiKey?: string;
  defaultModel: string;
  resize: boolean;
  /** Full instructions sent to the vision model (editable in CLI config / PWA). */
  renamePrompt: string;
  /** Saved prompt templates the user can switch between in the PWA. */
  promptPresets: PromptPreset[];
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'pixelphoto');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_PRESETS: PromptPreset[] = [
  {
    id: 'default',
    name: 'Standard — descriptive slug',
    prompt: DEFAULT_RENAME_PROMPT,
  },
  {
    id: 'short',
    name: 'Short — 2–4 words',
    prompt: `You rename photos. Return ONLY a very short filename slug: lowercase, dashes, 2–4 words max, no extension, no prose.
Example: red-door-at-dusk`,
  },
  {
    id: 'detailed',
    name: 'Detailed scene',
    prompt: `You are a photo archivist. Return ONE filename slug: lowercase, dashes only, no extension, max 8 words, describing the main subject and setting. No other text.`,
  },
];

const DEFAULT_CONFIG: AppConfig = {
  provider: 'openai',
  openaiApiKey: '',
  openrouterApiKey: '',
  defaultModel: 'gpt-5-nano-2025-08-07',
  resize: true,
  renamePrompt: DEFAULT_RENAME_PROMPT,
  promptPresets: DEFAULT_PRESETS,
};

export function loadConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG;
  }
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    const loaded = { ...DEFAULT_CONFIG, ...parsed };
    if (!loaded.renamePrompt || typeof loaded.renamePrompt !== 'string') {
      loaded.renamePrompt = DEFAULT_CONFIG.renamePrompt;
    }
    if (!Array.isArray(loaded.promptPresets) || loaded.promptPresets.length === 0) {
      loaded.promptPresets = [...DEFAULT_CONFIG.promptPresets];
    } else {
      loaded.promptPresets = loaded.promptPresets.map((p: unknown) => {
        const o = p as Partial<PromptPreset>;
        return {
          id: typeof o.id === 'string' && o.id ? o.id : randomUUID(),
          name: typeof o.name === 'string' && o.name ? o.name : 'Preset',
          prompt: typeof o.prompt === 'string' ? o.prompt : DEFAULT_RENAME_PROMPT,
        };
      });
    }
    // Patch old default from very early builds
    if (loaded.defaultModel === 'google/gemini-2.0-flash-lite-preview-02-05:free' || loaded.defaultModel === 'gpt-4o-mini') {
      loaded.defaultModel = 'gpt-5-nano-2025-08-07';
      loaded.provider = 'openai';
    }
    
    // Ensure backwards compat where provider didnt exist
    if (!loaded.provider) {
      if (loaded.openrouterApiKey) {
        loaded.provider = 'openrouter';
      } else {
        loaded.provider = 'openai';
        loaded.defaultModel = 'gpt-5-nano-2025-08-07';
      }
    }

    return loaded;
  } catch (error) {
    console.error('Failed to parse config file:', error);
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: AppConfig) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
