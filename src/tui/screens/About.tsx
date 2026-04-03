import React from 'react';
import { theme } from '../theme.js';

export function AboutScreen() {
  return (
    <box flexDirection="column" flexGrow={1} gap={1} padding={1}>
      <text>
        <strong fg={theme.primary}>PixelPhoto</strong> <span fg={theme.muted}>v1.0.0</span>
      </text>
      <text fg={theme.text}>
        AI-powered CLI that suggests filenames from image content (OpenAI or OpenRouter vision models).
      </text>
      <text fg={theme.muted}>
        Tip: Ghostty, Kitty, or WezTerm give the best mouse and keyboard integration with OpenTUI.
      </text>
    </box>
  );
}
