import React, { useCallback, useState } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { loadConfig, type AppConfig } from '../config.js';
import { AboutScreen } from './screens/About.js';
import { ConfigScreen } from './screens/Config.js';
import { HomeScreen } from './screens/Home.js';
import { OnboardingScreen } from './screens/Onboarding.js';
import { PresetsScreen } from './screens/Presets.js';
import { RunScreen } from './screens/Run.js';
import { theme } from './theme.js';
import type { Screen } from './types.js';

export function App(props: {
  initialDirectory?: string;
  startInOnboarding: boolean;
}) {
  const { width, height } = useTerminalDimensions();
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  const [screen, setScreen] = useState<Screen>(() =>
    props.startInOnboarding ? 'onboarding' : 'home'
  );

  const reload = useCallback(() => {
    setConfig(loadConfig());
  }, []);

  useKeyboard((e) => {
    if (e.name === 'escape' && screen !== 'home' && screen !== 'onboarding') {
      setScreen('home');
    }
  });

  const body = (() => {
    switch (screen) {
      case 'home':
        return <HomeScreen config={config} onNavigate={setScreen} />;
      case 'config':
        return (
          <ConfigScreen
            config={config}
            title="Configuration"
            onSaved={reload}
          />
        );
      case 'run':
        return <RunScreen initialDirectory={props.initialDirectory} />;
      case 'presets':
        return <PresetsScreen config={config} onSaved={reload} />;
      case 'onboarding':
        return (
          <OnboardingScreen
            config={config}
            onDone={() => {
              reload();
              setScreen('home');
            }}
          />
        );
      case 'about':
        return <AboutScreen />;
      default:
        return null;
    }
  })();

  return (
    <box width={width} height={height} flexDirection="column" backgroundColor={theme.bg}>
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        border
        borderStyle="single"
        borderColor={theme.border}
        backgroundColor={theme.surface}
      >
        <text>
          <strong fg={theme.primary}>pixelphoto</strong> <span fg={theme.muted}>· TUI</span>
        </text>
        <text fg={theme.muted}>
          {screen === 'home' ? 'Home' : screen} · Esc back
        </text>
      </box>

      <box
        flexGrow={1}
        flexDirection="column"
        marginLeft={1}
        marginRight={1}
        marginTop={0}
        marginBottom={0}
        paddingLeft={1}
        paddingRight={1}
        paddingBottom={1}
      >
        {body}
      </box>

      <box
        paddingLeft={1}
        paddingRight={1}
        paddingTop={1}
        paddingBottom={1}
        border
        borderStyle="single"
        borderColor={theme.border}
        backgroundColor={theme.surface}
      >
        <text fg={theme.muted}>
          ↑/↓ · Enter · Space · Mouse click · Esc · Ctrl+C exit
        </text>
      </box>
    </box>
  );
}
