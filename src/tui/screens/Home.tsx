import React, { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import type { AppConfig } from '../../config.js';
import { theme } from '../theme.js';
import type { Screen } from '../types.js';

const MENU: { id: Screen; title: string; hint: string }[] = [
  { id: 'run', title: 'Run rename', hint: 'Preview & apply vision-based names' },
  { id: 'config', title: 'Configuration', hint: 'API keys, model, resize' },
  { id: 'presets', title: 'Prompt presets', hint: 'Naming style presets' },
  { id: 'about', title: 'About', hint: 'Version & tips' },
];

export function HomeScreen(props: {
  config: AppConfig;
  onNavigate: (s: Screen) => void;
}) {
  const { config, onNavigate } = props;
  const provider = config.provider === 'openai' ? 'OpenAI' : 'OpenRouter';
  const [active, setActive] = useState(0);

  useKeyboard((e) => {
    if (e.eventType === 'release') return;
    const n = MENU.length;
    if (e.name === 'down' || e.name === 'j') {
      setActive((i) => Math.min(n - 1, i + 1));
    } else if (e.name === 'up' || e.name === 'k') {
      setActive((i) => Math.max(0, i - 1));
    } else if (e.name === 'return' || e.name === 'enter' || e.name === ' ') {
      onNavigate(MENU[active].id);
    }
  });

  return (
    <box flexDirection="column" flexGrow={1} gap={1} padding={1}>
      <box
        flexDirection="column"
        padding={2}
        gap={1}
        border
        borderStyle="single"
        borderColor={theme.primary}
        backgroundColor={theme.surface}
      >
        <text>
          <strong fg={theme.primary}>PixelPhoto</strong>
        </text>
        <text fg={theme.text}>AI bulk photo renamer</text>
        <text fg={theme.muted}>
          {provider} · {config.defaultModel}
        </text>
      </box>

      <text fg={theme.muted}>Choose an action (↑/↓ or j/k · Enter · click row)</text>

      <box flexDirection="column" gap={1}>
        {MENU.map((item, i) => {
          const selected = i === active;
          return (
            <box
              key={item.id}
              flexDirection="column"
              padding={1}
              gap={0}
              border
              borderStyle="rounded"
              borderColor={selected ? theme.primary : theme.border}
              backgroundColor={selected ? theme.surface : 'transparent'}
              onMouseDown={() => onNavigate(item.id)}
            >
              <text fg={selected ? theme.primary : theme.text}>
                <strong>{item.title}</strong>
              </text>
              <text fg={theme.muted}>{item.hint}</text>
            </box>
          );
        })}
      </box>
    </box>
  );
}
