import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useState } from 'react';
import { applyRenames, collectRenamesForDirectory, } from '../../core.js';
import { theme } from '../theme.js';
function formatProgress(p) {
    switch (p.type) {
        case 'scan':
            return `Found ${p.total} image(s).`;
        case 'vision_ok':
        case 'vision_fail':
            return '';
        case 'file_start':
            return `[${p.index + 1}/${p.total}] ${p.fileName}…`;
        case 'file_done':
            return `  ${p.oldName} → ${p.newName}`;
        case 'file_error':
            return `  ERROR ${p.fileName}: ${p.message}`;
        case 'rate_limit':
            return `  (rate limit, retry in ${p.delayMs / 1000}s)`;
        default:
            return '';
    }
}
export function RunScreen(props) {
    const [dir, setDir] = useState(props.initialDirectory ?? '.');
    const [modelOverride, setModelOverride] = useState('');
    const [noResize, setNoResize] = useState(false);
    const [busy, setBusy] = useState(false);
    const [lines, setLines] = useState([]);
    const [pending, setPending] = useState(null);
    const start = async () => {
        setBusy(true);
        setLines([]);
        setPending(null);
        try {
            const entries = await collectRenamesForDirectory({
                directory: dir.trim() || '.',
                model: modelOverride.trim() || undefined,
                noResize: noResize,
                onProgress: (p) => {
                    setLines((prev) => [...prev, formatProgress(p)]);
                },
            });
            setPending(entries.length ? entries : null);
            setLines((prev) => [
                ...prev,
                entries.length
                    ? `Ready: ${entries.length} rename(s). Review below, then apply.`
                    : 'No successful suggestions.',
            ]);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setLines((prev) => [...prev, `Error: ${msg}`]);
        }
        finally {
            setBusy(false);
        }
    };
    const apply = () => {
        if (!pending?.length)
            return;
        applyRenames(pending);
        setLines((prev) => [...prev, `Applied ${pending.length} rename(s) on disk.`]);
        setPending(null);
    };
    return (_jsxs("box", { flexDirection: "column", flexGrow: 1, gap: 1, padding: 1, children: [_jsx("text", { fg: theme.primary, children: _jsx("strong", { children: "Run rename" }) }), _jsx("text", { fg: theme.muted, children: "Directory" }), _jsx("input", { focused: !busy, placeholder: "/path/to/photos", value: dir, onChange: setDir }), _jsx("text", { fg: theme.muted, children: "Model override (optional)" }), _jsx("input", { placeholder: "Leave empty for config default", value: modelOverride, onChange: setModelOverride }), _jsx("text", { fg: theme.muted, children: "Resize before vision" }), _jsx("select", { selectedIndex: noResize ? 1 : 0, options: [
                    { name: 'Use config default', description: 'Follow saved setting', value: 'cfg' },
                    { name: 'Force no resize', description: 'Full file read', value: 'off' },
                ], onSelect: (_i, opt) => {
                    const v = opt?.value;
                    if (v === 'cfg')
                        setNoResize(false);
                    if (v === 'off')
                        setNoResize(true);
                } }), _jsxs("box", { flexDirection: "row", gap: 2, children: [_jsx("box", { border: true, padding: 1, backgroundColor: busy ? theme.border : theme.surface, onMouseDown: () => {
                            if (!busy)
                                void start();
                        }, children: _jsx("text", { fg: busy ? theme.muted : theme.primary, children: busy ? 'Running…' : 'Start preview' }) }), _jsx("box", { border: true, padding: 1, backgroundColor: pending?.length ? theme.surface : theme.border, onMouseDown: () => {
                            if (pending?.length)
                                apply();
                        }, children: _jsx("text", { fg: pending?.length ? theme.success : theme.muted, children: "Apply renames" }) })] }), _jsx("scrollbox", { flexGrow: 1, border: true, borderColor: theme.border, children: _jsx("text", { children: lines.join('\n') || 'Log output will appear here.' }) })] }));
}
