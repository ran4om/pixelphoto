import React, { useState } from 'react';
import type { AppConfig, PromptPreset } from '../../config.js';
import { saveConfig } from '../../config.js';
import { theme } from '../theme.js';

function newPresetId(): string {
  return `p-${Math.random().toString(36).slice(2, 10)}`;
}

export function PresetsScreen(props: { config: AppConfig; onSaved: () => void }) {
  const { config, onSaved } = props;
  const [draft, setDraft] = useState<AppConfig>(() => ({
    ...config,
    promptPresets: config.promptPresets.map((p) => ({ ...p })),
  }));
  const [selected, setSelected] = useState(0);

  const presets = draft.promptPresets;
  const safeIndex = Math.min(selected, Math.max(0, presets.length - 1));
  const current = presets[safeIndex];

  const updateCurrent = (patch: Partial<PromptPreset>) => {
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
    const p: PromptPreset = {
      id: newPresetId(),
      name: 'New preset',
      description: '',
      promptTemplate: 'Describe how filenames should sound.',
    };
    setDraft((d) => ({ ...d, promptPresets: [...d.promptPresets, p] }));
    setSelected(presets.length);
  };

  const removeCurrent = () => {
    if (presets.length <= 1) return;
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

  return (
    <box flexDirection="column" flexGrow={1} gap={1} padding={1}>
      <text fg={theme.primary}>
        <strong>Prompt presets</strong>
      </text>

      <text fg={theme.muted}>Active preset for renames</text>
      <select
        focused
        selectedIndex={Math.max(
          0,
          presets.findIndex((p) => p.id === draft.activePreset)
        )}
        options={presets.map((p) => ({
          name: p.name,
          description: p.description,
          value: p.id,
        }))}
        onSelect={(_i, opt) => {
          const id = opt?.value as string | undefined;
          if (id) setDraft((d) => ({ ...d, activePreset: id }));
        }}
      />

      <text fg={theme.muted}>Edit preset</text>
      <select
        selectedIndex={safeIndex}
        options={presets.map((p, i) => ({
          name: p.name,
          description: p.id,
          value: String(i),
        }))}
        onSelect={(i) => {
          setSelected(i);
        }}
      />

      {current ? (
        <box flexDirection="column" gap={1} border borderStyle="single" borderColor={theme.border} padding={1}>
          <text fg={theme.muted}>Name</text>
          <input
            value={current.name}
            onChange={(v) => updateCurrent({ name: v })}
          />
          <text fg={theme.muted}>Description</text>
          <input
            value={current.description}
            onChange={(v) => updateCurrent({ description: v })}
          />
          <text fg={theme.muted}>Extra instructions (appended to vision prompt)</text>
          <input
            placeholder="Style hints…"
            value={current.promptTemplate}
            onChange={(v) => updateCurrent({ promptTemplate: v })}
          />
        </box>
      ) : null}

      <box flexDirection="row" gap={2}>
        <box
          border
          padding={1}
          backgroundColor={theme.surface}
          onMouseDown={addPreset}
        >
          <text fg={theme.primary}>New preset</text>
        </box>
        <box
          border
          padding={1}
          backgroundColor={theme.surface}
          onMouseDown={removeCurrent}
        >
          <text fg={theme.error}>Delete</text>
        </box>
        <box border padding={1} backgroundColor={theme.surface} onMouseDown={save}>
          <text fg={theme.success}>Save</text>
        </box>
      </box>
    </box>
  );
}
