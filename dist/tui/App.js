import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback, useState } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { loadConfig } from '../config.js';
import { AboutScreen } from './screens/About.js';
import { ConfigScreen } from './screens/Config.js';
import { HomeScreen } from './screens/Home.js';
import { OnboardingScreen } from './screens/Onboarding.js';
import { PresetsScreen } from './screens/Presets.js';
import { RunScreen } from './screens/Run.js';
import { theme } from './theme.js';
export function App(props) {
    const { width, height } = useTerminalDimensions();
    const [config, setConfig] = useState(() => loadConfig());
    const [screen, setScreen] = useState(() => props.startInOnboarding ? 'onboarding' : 'home');
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
                return _jsx(HomeScreen, { config: config, onNavigate: setScreen });
            case 'config':
                return (_jsx(ConfigScreen, { config: config, title: "Configuration", onSaved: reload }));
            case 'run':
                return _jsx(RunScreen, { initialDirectory: props.initialDirectory });
            case 'presets':
                return _jsx(PresetsScreen, { config: config, onSaved: reload });
            case 'onboarding':
                return (_jsx(OnboardingScreen, { config: config, onDone: () => {
                        reload();
                        setScreen('home');
                    } }));
            case 'about':
                return _jsx(AboutScreen, {});
            default:
                return null;
        }
    })();
    return (_jsxs("box", { width: width, height: height, flexDirection: "column", backgroundColor: theme.bg, children: [_jsxs("box", { flexDirection: "row", justifyContent: "space-between", paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1, border: true, borderStyle: "single", borderColor: theme.border, backgroundColor: theme.surface, children: [_jsxs("text", { children: [_jsx("strong", { fg: theme.primary, children: "pixelphoto" }), " ", _jsx("span", { fg: theme.muted, children: "\u00B7 TUI" })] }), _jsxs("text", { fg: theme.muted, children: [screen === 'home' ? 'Home' : screen, " \u00B7 Esc back"] })] }), _jsx("box", { flexGrow: 1, flexDirection: "column", marginLeft: 1, marginRight: 1, marginTop: 0, marginBottom: 0, paddingLeft: 1, paddingRight: 1, paddingBottom: 1, children: body }), _jsx("box", { paddingLeft: 1, paddingRight: 1, paddingTop: 1, paddingBottom: 1, border: true, borderStyle: "single", borderColor: theme.border, backgroundColor: theme.surface, children: _jsx("text", { fg: theme.muted, children: "\u2191/\u2193 \u00B7 Enter \u00B7 Space \u00B7 Mouse click \u00B7 Esc \u00B7 Ctrl+C exit" }) })] }));
}
