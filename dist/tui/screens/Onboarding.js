import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { theme } from '../theme.js';
import { ConfigScreen } from './Config.js';
export function OnboardingScreen(props) {
    return (_jsxs("box", { flexDirection: "column", flexGrow: 1, gap: 1, padding: 1, children: [_jsx("text", { fg: theme.text, children: "Welcome \u2014 connect an AI provider to rename photos from image content." }), _jsx(ConfigScreen, { config: props.config, onSaved: props.onDone, title: "Setup" })] }));
}
