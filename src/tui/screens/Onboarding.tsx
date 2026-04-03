import React from 'react';
import type { AppConfig } from '../../config.js';
import { theme } from '../theme.js';
import { ConfigScreen } from './Config.js';

export function OnboardingScreen(props: { config: AppConfig; onDone: () => void }) {
  return (
    <box flexDirection="column" flexGrow={1} gap={1} padding={1}>
      <text fg={theme.text}>
        Welcome — connect an AI provider to rename photos from image content.
      </text>
      <ConfigScreen config={props.config} onSaved={props.onDone} title="Setup" />
    </box>
  );
}
