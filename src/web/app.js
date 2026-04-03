const $ = id => document.getElementById(id);

let lastPlan = [];
let deferredInstall = null;
/** @type {any} */
let currentConfig = null;

function showToast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderColor = isError ? 'rgba(248,113,113,0.5)' : 'rgba(52,211,153,0.35)';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = data.error || data.message || res.statusText || 'Request failed';
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return data;
}

function setHealth(ok, text) {
  const dot = $('health-dot');
  const label = $('health-text');
  dot.classList.remove('ok', 'err');
  dot.classList.add(ok ? 'ok' : 'err');
  label.textContent = text;
}

async function checkHealth() {
  try {
    await api('/api/health');
    setHealth(true, 'Local server connected');
  } catch {
    setHealth(false, 'Server unreachable');
  }
}

function renderPresets(config) {
  const select = $('preset-select');
  const list = $('presets-list');
  select.innerHTML = '';
  (config.promptPresets || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  list.innerHTML = '';
  (config.promptPresets || []).forEach(p => {
    const pt = p.promptTemplate ?? p.prompt ?? '';
    const row = document.createElement('div');
    row.className = 'preset-item';
    row.innerHTML = `<div><strong>${escapeHtml(p.name)}</strong><div class="hint mono" style="margin-top:4px">${escapeHtml(
      pt.slice(0, 80)
    )}${pt.length > 80 ? '…' : ''}</div></div>`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn danger';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!confirm(`Delete preset “${p.name}”?`)) return;
      try {
        const r = await api(`/api/presets/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
        applyConfig(r.config);
        showToast('Preset removed');
      } catch (e) {
        showToast(e.message, true);
      }
    });
    row.appendChild(del);
    list.appendChild(row);
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function applyConfig(config) {
  currentConfig = config;
  $('provider').value = config.provider;
  $('openai-key').value = config.openaiApiKey || '';
  $('or-key').value = config.openrouterApiKey || '';
  $('model').value = config.defaultModel || '';
  $('resize').checked = Boolean(config.resize);
  $('rename-prompt').value = config.renamePrompt || '';
  toggleProviderFields();
  renderPresets(config);
}

async function loadConfig() {
  const config = await api('/api/config');
  applyConfig(config);
}

async function refreshModels() {
  const meta = $('models-meta');
  meta.textContent = 'Loading…';
  try {
    const r = await api('/api/models');
    const dl = $('model-suggestions');
    dl.innerHTML = '';
    r.models.forEach(m => {
      const o = document.createElement('option');
      o.value = m;
      dl.appendChild(o);
    });
    meta.textContent =
      r.source === 'live' ? `Live list (${r.models.length} models)` : `Fallback list${r.error ? ': ' + r.error : ''}`;
  } catch (e) {
    meta.textContent = '';
    showToast(e.message, true);
  }
}

function toggleProviderFields() {
  const p = $('provider').value;
  $('field-openai-key').hidden = p !== 'openai';
  $('field-or-key').hidden = p !== 'openrouter';
}

function readConfigFromForm() {
  return {
    provider: $('provider').value,
    openaiApiKey: $('openai-key').value,
    openrouterApiKey: $('or-key').value,
    defaultModel: $('model').value.trim(),
    resize: $('resize').checked,
    renamePrompt: $('rename-prompt').value,
  };
}

async function saveConfigClick() {
  try {
    const body = readConfigFromForm();
    const r = await api('/api/config', { method: 'PUT', body: JSON.stringify(body) });
    applyConfig(r.config);
    showToast('Configuration saved');
    await refreshModels();
  } catch (e) {
    showToast(e.message, true);
  }
}

function wirePresetSelect() {
  $('preset-select').addEventListener('change', () => {
    const id = $('preset-select').value;
    const preset = (currentConfig?.promptPresets || []).find(p => p.id === id);
    if (preset) {
      $('rename-prompt').value = preset.promptTemplate ?? preset.prompt ?? '';
    }
  });
}

// Preview
let previewDataUrl = null;
let previewMime = 'image/jpeg';

function wirePreview() {
  const zone = $('drop-zone');
  const input = $('file-input');
  const img = $('preview-img');
  const ph = $('preview-placeholder');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.style.borderColor = 'rgba(129,140,248,0.6)';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = '';
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) loadFile(f);
  });

  function loadFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', true);
      return;
    }
    previewMime = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = () => {
      previewDataUrl = reader.result;
      img.src = previewDataUrl;
      img.hidden = false;
      ph.hidden = true;
      $('run-preview').disabled = false;
    };
    reader.readAsDataURL(file);
  }

  $('run-preview').addEventListener('click', async () => {
    if (!previewDataUrl) return;
    $('preview-result').textContent = 'Running…';
    const base64 = previewDataUrl.split(',')[1];
    const body = {
      base64,
      mimeType: previewMime,
      prompt: $('rename-prompt').value,
    };
    const pm = $('preview-model').value.trim();
    if (pm) body.model = pm;
    try {
      const r = await api('/api/preview', { method: 'POST', body: JSON.stringify(body) });
      $('preview-result').textContent = `→ ${r.slug}`;
    } catch (e) {
      $('preview-result').textContent = '';
      showToast(e.message, true);
    }
  });
}

function wireBatch() {
  $('plan-batch').addEventListener('click', async () => {
    $('batch-status').textContent = '';
    $('plan-table').hidden = true;
    $('plan-body').innerHTML = '';
    lastPlan = [];
    $('apply-batch').disabled = true;
    const directory = $('folder-path').value.trim();
    if (!directory) {
      showToast('Enter a folder path', true);
      return;
    }
    $('batch-status').textContent = 'Planning… (this may take a while)';
    try {
      const body = {
        directory,
        noResize: $('batch-no-resize').checked,
        prompt: $('rename-prompt').value,
      };
      const pm = $('model').value.trim();
      if (pm) body.model = pm;
      const r = await api('/api/plan', { method: 'POST', body: JSON.stringify(body) });
      lastPlan = r.plan || [];
      $('apply-batch').disabled = lastPlan.length === 0;
      if (r.failed?.length) {
        $('batch-status').textContent = `${r.failed.length} file(s) failed. ${r.failed.map(f => f.file).join(', ')}`;
      } else {
        $('batch-status').textContent = `${lastPlan.length} rename(s) planned.`;
      }
      const tbody = $('plan-body');
      tbody.innerHTML = '';
      lastPlan.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="mono">${escapeHtml(row.oldName)}</td><td class="mono">${escapeHtml(row.newName)}</td>`;
        tbody.appendChild(tr);
      });
      $('plan-table').hidden = lastPlan.length === 0;
    } catch (e) {
      $('batch-status').textContent = '';
      showToast(e.message, true);
    }
  });

  $('apply-batch').addEventListener('click', async () => {
    if (!lastPlan.length) return;
    if (!confirm(`Apply ${lastPlan.length} rename(s)? This cannot be undone automatically.`)) return;
    try {
      await api('/api/apply', {
        method: 'POST',
        body: JSON.stringify({ entries: lastPlan.map(p => ({ oldPath: p.oldPath, newPath: p.newPath })) }),
      });
      showToast('Renames applied');
      lastPlan = [];
      $('apply-batch').disabled = true;
      $('plan-table').hidden = true;
      $('plan-body').innerHTML = '';
      $('batch-status').textContent = 'Done.';
    } catch (e) {
      showToast(e.message, true);
    }
  });
}

function wireInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    $('install-banner').classList.add('visible');
  });
  $('install-btn').addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $('install-banner').classList.remove('visible');
  });
}

async function init() {
  wirePresetSelect();
  wirePreview();
  wireBatch();
  wireInstall();
  $('provider').addEventListener('change', toggleProviderFields);
  $('save-config').addEventListener('click', saveConfigClick);
  $('refresh-models').addEventListener('click', refreshModels);
  $('save-preset').addEventListener('click', async () => {
    const name = $('new-preset-name').value.trim();
    const prompt = $('rename-prompt').value;
    if (!name) {
      showToast('Enter a preset name', true);
      return;
    }
    try {
      const r = await api('/api/presets', {
        method: 'POST',
        body: JSON.stringify({ name, prompt }),
      });
      $('new-preset-name').value = '';
      applyConfig(r.config);
      showToast('Preset saved');
    } catch (e) {
      showToast(e.message, true);
    }
  });

  await checkHealth();
  try {
    await loadConfig();
    await refreshModels();
  } catch (e) {
    setHealth(false, 'Config load failed');
    showToast(e.message, true);
  }
}

init();
