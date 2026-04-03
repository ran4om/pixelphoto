import React, { useState } from 'react';
import {
  applyRenames,
  collectRenamesForDirectory,
  type RenameEntry,
  type RenameProgress,
} from '../../core.js';
import { theme } from '../theme.js';

function formatProgress(p: RenameProgress): string {
  switch (p.type) {
    case 'scan':
      return `Found ${p.total} image(s).`;
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

export function RunScreen(props: { initialDirectory?: string }) {
  const [dir, setDir] = useState(props.initialDirectory ?? '.');
  const [modelOverride, setModelOverride] = useState('');
  const [noResize, setNoResize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [pending, setPending] = useState<RenameEntry[] | null>(null);

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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLines((prev) => [...prev, `Error: ${msg}`]);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!pending?.length) return;
    applyRenames(pending);
    setLines((prev) => [...prev, `Applied ${pending.length} rename(s) on disk.`]);
    setPending(null);
  };

  return (
    <box flexDirection="column" flexGrow={1} gap={1} padding={1}>
      <text fg={theme.primary}>
        <strong>Run rename</strong>
      </text>

      <text fg={theme.muted}>Directory</text>
      <input
        focused={!busy}
        placeholder="/path/to/photos"
        value={dir}
        onChange={setDir}
      />

      <text fg={theme.muted}>Model override (optional)</text>
      <input
        placeholder="Leave empty for config default"
        value={modelOverride}
        onChange={setModelOverride}
      />

      <text fg={theme.muted}>Resize before vision</text>
      <select
        selectedIndex={noResize ? 1 : 0}
        options={[
          { name: 'Use config default', description: 'Follow saved setting', value: 'cfg' },
          { name: 'Force no resize', description: 'Full file read', value: 'off' },
        ]}
        onSelect={(_i, opt) => {
          const v = opt?.value;
          if (v === 'cfg') setNoResize(false);
          if (v === 'off') setNoResize(true);
        }}
      />

      <box flexDirection="row" gap={2}>
        <box
          border
          padding={1}
          backgroundColor={busy ? theme.border : theme.surface}
          onMouseDown={() => {
            if (!busy) void start();
          }}
        >
          <text fg={busy ? theme.muted : theme.primary}>{busy ? 'Running…' : 'Start preview'}</text>
        </box>
        <box
          border
          padding={1}
          backgroundColor={pending?.length ? theme.surface : theme.border}
          onMouseDown={() => {
            if (pending?.length) apply();
          }}
        >
          <text fg={pending?.length ? theme.success : theme.muted}>Apply renames</text>
        </box>
      </box>

      <scrollbox flexGrow={1} border borderColor={theme.border}>
        <text>{lines.join('\n') || 'Log output will appear here.'}</text>
      </scrollbox>
    </box>
  );
}
