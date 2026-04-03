import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useState } from 'react';
import { saveConfig } from '../../config.js';
import { fetchOpenAiVisionModels, fetchOpenRouterVisionModels } from '../../models.js';
import { theme } from '../theme.js';
export function ConfigScreen(props) {
    const { config, onSaved, title = 'Configuration' } = props;
    const [draft, setDraft] = useState(() => ({
        ...config,
        promptPresets: config.promptPresets.map((p) => ({ ...p })),
    }));
    const [modelChoices, setModelChoices] = useState(() => [config.defaultModel]);
    const [status, setStatus] = useState('');
    const setProvider = (p) => {
        setDraft((d) => ({ ...d, provider: p }));
    };
    const refreshModels = async () => {
        setStatus('Fetching…');
        try {
            if (draft.provider === 'openrouter') {
                const m = await fetchOpenRouterVisionModels();
                setModelChoices(m.length ? m : [draft.defaultModel]);
                setStatus(`${m.length} OpenRouter models`);
            }
            else {
                if (!draft.openaiApiKey?.trim()) {
                    setStatus('Set OpenAI API key first');
                    return;
                }
                const m = await fetchOpenAiVisionModels(draft.openaiApiKey.trim());
                setModelChoices(m.length ? m : [draft.defaultModel]);
                setStatus(`${m.length} OpenAI models`);
            }
        }
        catch (e) {
            setStatus(e instanceof Error ? e.message : String(e));
        }
    };
    const save = () => {
        saveConfig(draft);
        setStatus('Saved.');
        onSaved();
    };
    return (_jsxs("box", { flexDirection: "column", flexGrow: 1, gap: 1, padding: 1, children: [_jsx("text", { fg: theme.primary, children: _jsx("strong", { children: title }) }), _jsx("tabselect", { focused: true, options: [
                    { name: 'OpenAI', description: 'Direct API', value: 'openai' },
                    { name: 'OpenRouter', description: 'Proxy / free models', value: 'openrouter' },
                ], onSelect: (_i, opt) => {
                    const v = opt?.value;
                    if (v === 'openai' || v === 'openrouter')
                        setProvider(v);
                } }), draft.provider === 'openai' ? (_jsxs("box", { flexDirection: "column", gap: 1, children: [_jsx("text", { fg: theme.muted, children: "OpenAI API key" }), _jsx("input", { placeholder: "sk-...", value: draft.openaiApiKey ?? '', onChange: (v) => setDraft((d) => ({ ...d, openaiApiKey: v })) })] })) : (_jsxs("box", { flexDirection: "column", gap: 1, children: [_jsx("text", { fg: theme.muted, children: "OpenRouter API key" }), _jsx("input", { placeholder: "sk-or-...", value: draft.openrouterApiKey ?? '', onChange: (v) => setDraft((d) => ({ ...d, openrouterApiKey: v })) })] })), _jsx("box", { flexDirection: "row", gap: 2, children: _jsx("box", { border: true, padding: 1, backgroundColor: theme.surface, onMouseDown: () => {
                        void refreshModels();
                    }, children: _jsx("text", { fg: theme.primary, children: "Refresh model list" }) }) }), _jsx("text", { fg: theme.muted, children: "Default model" }), _jsx("select", { selectedIndex: Math.max(0, modelChoices.findIndex((id) => id === draft.defaultModel)), options: modelChoices.map((id) => ({
                    name: id,
                    description: '',
                    value: id,
                })), onSelect: (_i, opt) => {
                    const v = opt?.value;
                    if (v)
                        setDraft((d) => ({ ...d, defaultModel: v }));
                } }), _jsx("text", { fg: theme.muted, children: "Resize images before sending (max 1024)" }), _jsx("select", { selectedIndex: draft.resize ? 0 : 1, options: [
                    { name: 'Yes', description: 'Smaller payload, faster', value: 'yes' },
                    { name: 'No', description: 'Full resolution read', value: 'no' },
                ], onSelect: (_i, opt) => {
                    const v = opt?.value;
                    if (v === 'yes' || v === 'no') {
                        setDraft((d) => ({ ...d, resize: v === 'yes' }));
                    }
                } }), status ? (_jsx("text", { fg: theme.warning, children: status })) : null, _jsx("box", { border: true, padding: 1, backgroundColor: theme.surface, onMouseDown: save, children: _jsx("text", { fg: theme.success, children: "Save configuration" }) })] }));
}
