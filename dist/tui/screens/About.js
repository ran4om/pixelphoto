import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { theme } from '../theme.js';
export function AboutScreen() {
    return (_jsxs("box", { flexDirection: "column", flexGrow: 1, gap: 1, padding: 1, children: [_jsxs("text", { children: [_jsx("strong", { fg: theme.primary, children: "PixelPhoto" }), " ", _jsx("span", { fg: theme.muted, children: "v1.0.0" })] }), _jsx("text", { fg: theme.text, children: "AI-powered CLI that suggests filenames from image content (OpenAI or OpenRouter vision models)." }), _jsx("text", { fg: theme.muted, children: "Tip: Ghostty, Kitty, or WezTerm give the best mouse and keyboard integration with OpenTUI." })] }));
}
