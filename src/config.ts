import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AppConfig {
  provider: 'openrouter' | 'openai';
  openrouterApiKey?: string;
  openaiApiKey?: string;
  defaultModel: string;
  resize: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'pixelphoto');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  provider: 'openai',
  openaiApiKey: '',
  openrouterApiKey: '',
  defaultModel: 'gpt-5-nano-2025-08-07',
  resize: true,
};

export function loadConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG;
  }
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    const loaded = { ...DEFAULT_CONFIG, ...parsed };
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
