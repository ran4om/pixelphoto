import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { theme } from '../theme.js';
const MENU = [
    { id: 'run', title: 'Run rename', hint: 'Preview & apply vision-based names' },
    { id: 'config', title: 'Configuration', hint: 'API keys, model, resize' },
    { id: 'presets', title: 'Prompt presets', hint: 'Naming style presets' },
    { id: 'about', title: 'About', hint: 'Version & tips' },
];
export function HomeScreen(props) {
    const { config, onNavigate } = props;
    const provider = config.provider === 'openai' ? 'OpenAI' : 'OpenRouter';
    const [active, setActive] = useState(0);
    useKeyboard((e) => {
        if (e.eventType === 'release')
            return;
        const n = MENU.length;
        if (e.name === 'down' || e.name === 'j') {
            setActive((i) => Math.min(n - 1, i + 1));
        }
        else if (e.name === 'up' || e.name === 'k') {
            setActive((i) => Math.max(0, i - 1));
        }
        else if (e.name === 'return' || e.name === 'enter' || e.name === ' ') {
            onNavigate(MENU[active].id);
        }
    });
    return (_jsxs("box", { flexDirection: "column", flexGrow: 1, gap: 1, padding: 1, children: [_jsxs("box", { flexDirection: "column", padding: 2, gap: 1, border: true, borderStyle: "single", borderColor: theme.primary, backgroundColor: theme.surface, children: [_jsx("text", { children: _jsx("strong", { fg: theme.primary, children: "PixelPhoto" }) }), _jsx("text", { fg: theme.text, children: "AI bulk photo renamer" }), _jsxs("text", { fg: theme.muted, children: [provider, " \u00B7 ", config.defaultModel] })] }), _jsx("text", { fg: theme.muted, children: "Choose an action (\u2191/\u2193 or j/k \u00B7 Enter \u00B7 click row)" }), _jsx("box", { flexDirection: "column", gap: 1, children: MENU.map((item, i) => {
                    const selected = i === active;
                    return (_jsxs("box", { flexDirection: "column", padding: 1, gap: 0, border: true, borderStyle: "rounded", borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.surface : 'transparent', onMouseDown: () => onNavigate(item.id), children: [_jsx("text", { fg: selected ? theme.primary : theme.text, children: _jsx("strong", { children: item.title }) }), _jsx("text", { fg: theme.muted, children: item.hint })] }, item.id));
                }) })] }));
}
