import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useState } from 'react';
import { saveConfig } from '../../config.js';
import { theme } from '../theme.js';
function newPresetId() {
    return `p-${Math.random().toString(36).slice(2, 10)}`;
}
export function PresetsScreen(props) {
    const { config, onSaved } = props;
    const [draft, setDraft] = useState(() => ({
        ...config,
        promptPresets: config.promptPresets.map((p) => ({ ...p })),
    }));
    const [selected, setSelected] = useState(0);
    const presets = draft.promptPresets;
    const safeIndex = Math.min(selected, Math.max(0, presets.length - 1));
    const current = presets[safeIndex];
    const updateCurrent = (patch) => {
        setDraft((d) => {
            const next = [...d.promptPresets];
            next[safeIndex] = { ...next[safeIndex], ...patch };
            return { ...d, promptPresets: next };
        });
    };
    const save = () => {
        saveConfig(draft);
        onSaved();
    };
    const addPreset = () => {
        const p = {
            id: newPresetId(),
            name: 'New preset',
            description: '',
            promptTemplate: 'Describe how filenames should sound.',
        };
        setDraft((d) => ({ ...d, promptPresets: [...d.promptPresets, p] }));
        setSelected(presets.length);
    };
    const removeCurrent = () => {
        if (presets.length <= 1)
            return;
        const id = presets[safeIndex].id;
        setDraft((d) => {
            const next = d.promptPresets.filter((_, i) => i !== safeIndex);
            let active = d.activePreset;
            if (active === id) {
                active = next[0]?.id ?? 'default';
            }
            return { ...d, promptPresets: next, activePreset: active };
        });
        setSelected((s) => Math.max(0, s - 1));
    };
    return (_jsxs("box", { flexDirection: "column", flexGrow: 1, gap: 1, padding: 1, children: [_jsx("text", { fg: theme.primary, children: _jsx("strong", { children: "Prompt presets" }) }), _jsx("text", { fg: theme.muted, children: "Active preset for renames" }), _jsx("select", { focused: true, selectedIndex: Math.max(0, presets.findIndex((p) => p.id === draft.activePreset)), options: presets.map((p) => ({
                    name: p.name,
                    description: p.description,
                    value: p.id,
                })), onSelect: (_i, opt) => {
                    const id = opt?.value;
                    if (id)
                        setDraft((d) => ({ ...d, activePreset: id }));
                } }), _jsx("text", { fg: theme.muted, children: "Edit preset" }), _jsx("select", { selectedIndex: safeIndex, options: presets.map((p, i) => ({
                    name: p.name,
                    description: p.id,
                    value: String(i),
                })), onSelect: (i) => {
                    setSelected(i);
                } }), current ? (_jsxs("box", { flexDirection: "column", gap: 1, border: true, borderStyle: "single", borderColor: theme.border, padding: 1, children: [_jsx("text", { fg: theme.muted, children: "Name" }), _jsx("input", { value: current.name, onChange: (v) => updateCurrent({ name: v }) }), _jsx("text", { fg: theme.muted, children: "Description" }), _jsx("input", { value: current.description, onChange: (v) => updateCurrent({ description: v }) }), _jsx("text", { fg: theme.muted, children: "Extra instructions (appended to vision prompt)" }), _jsx("input", { placeholder: "Style hints\u2026", value: current.promptTemplate, onChange: (v) => updateCurrent({ promptTemplate: v }) })] })) : null, _jsxs("box", { flexDirection: "row", gap: 2, children: [_jsx("box", { border: true, padding: 1, backgroundColor: theme.surface, onMouseDown: addPreset, children: _jsx("text", { fg: theme.primary, children: "New preset" }) }), _jsx("box", { border: true, padding: 1, backgroundColor: theme.surface, onMouseDown: removeCurrent, children: _jsx("text", { fg: theme.error, children: "Delete" }) }), _jsx("box", { border: true, padding: 1, backgroundColor: theme.surface, onMouseDown: save, children: _jsx("text", { fg: theme.success, children: "Save" }) })] })] }));
}
