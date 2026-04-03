const $ = id => document.getElementById(id);

let lastPlan = [];
/** @type {string | null} */
let lastPlanId = null;
let deferredInstall = null;
/** @type {any} */
let currentConfig = null;

/**
 * Display a transient toast message overlayed on the page.
 * @param {string} message - The text to display inside the toast.
 * @param {boolean} [isError=false] - When true, apply error styling; otherwise apply success/info styling.
 */
function showToast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderColor = isError ? 'rgba(248,113,113,0.5)' : 'rgba(52,211,153,0.35)';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/**
 * Performs an HTTP request to the given path and returns the response parsed as JSON.
 *
 * The function sends fetch options merged with a JSON `Content-Type` header, attempts to parse
 * the response body as JSON, and normalizes non-JSON bodies to `{ raw: string }`.
 *
 * @param {string} path - Request URL or path.
 * @param {Object} [opts] - Optional fetch options (e.g., `method`, `headers`, `body`); provided
 *   headers are merged with `Content-Type: application/json`.
 * @returns {any} The parsed response body. If the body is empty, returns `{}`; if JSON parsing
 *   fails, returns `{ raw: string }` containing the raw response text.
 * @throws {Error} When the response has a non-OK status; the error message is taken from
 *   `response.error`, `response.message`, or the HTTP status text.
 */
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

/**
 * Update the UI health indicator and its label to reflect the current server status.
 *
 * @param {boolean} ok - `true` to mark the status as healthy/connected, `false` to mark it as error/unreachable.
 * @param {string} text - The status message to display in the health label.
 */
function setHealth(ok, text) {
  const dot = $('health-dot');
  const label = $('health-text');
  dot.classList.remove('ok', 'err');
  dot.classList.add(ok ? 'ok' : 'err');
  label.textContent = text;
}

/**
 * Checks server health and updates the UI health indicator.
 *
 * Calls the health endpoint and sets the indicator to "Local server connected" on success; sets it to "Server unreachable" on failure.
 */
async function checkHealth() {
  try {
    await api('/api/health');
    setHealth(true, 'Local server connected');
  } catch {
    setHealth(false, 'Server unreachable');
  }
}

/**
 * Populate the preset selector and the visible preset list from the given configuration.
 *
 * Updates the DOM elements with id "preset-select" (options) and "presets-list" (rows). Each preset row includes name, truncated prompt preview, and a "Delete" button that removes the preset via the API and reapplies the returned configuration.
 *
 * @param {{ promptPresets?: { id: string, name: string, prompt: string }[] }} config - Configuration object containing an optional `promptPresets` array; each preset must include `id`, `name`, and `prompt`.
 */
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
    const row = document.createElement('div');
    row.className = 'preset-item';
    row.innerHTML = `<div><strong>${escapeHtml(p.name)}</strong><div class="hint mono" style="margin-top:4px">${escapeHtml(
      p.prompt.slice(0, 80)
    )}${p.prompt.length > 80 ? '…' : ''}</div></div>`;
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

/**
 * Escape HTML-sensitive characters to make a string safe for insertion into HTML.
 * @param {string} s - Input string that may contain HTML-sensitive characters.
 * @returns {string} The input with `&`, `<`, and `>` replaced by `&amp;`, `&lt;`, and `&gt;` respectively.
 */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Populate UI controls and internal state from the provided configuration object.
 *
 * Updates `currentConfig`, form fields for provider, API keys, model, resize checkbox,
 * and rename prompt; adjusts provider-specific field visibility and renders prompt presets.
 * @param {Object} config - Configuration values.
 * @param {string} config.provider - Selected provider identifier (e.g., "openai", "openrouter").
 * @param {string} [config.openaiApiKey] - OpenAI API key.
 * @param {string} [config.openrouterApiKey] - OpenRouter API key.
 * @param {string} [config.defaultModel] - Default model name.
 * @param {boolean} [config.resize] - Whether image resizing is enabled.
 * @param {string} [config.renamePrompt] - Prompt used for renaming.
 * @param {Array<Object>} [config.promptPresets] - Prompt presets to render (each preset object may include `id`, `name`, and `prompt`).
 */
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

/**
 * Load the persisted configuration from the server and apply it to the UI.
 *
 * Fetches the current configuration and updates form fields, provider-specific controls, and prompt presets via applyConfig.
 */
async function loadConfig() {
  const config = await api('/api/config');
  applyConfig(config);
}

/**
 * Load available model names from the server and populate the model suggestions list.
 *
 * Updates the text of the element with id "models-meta" to reflect loading state and source,
 * fills the datalist with id "model-suggestions" with option entries for each returned model,
 * and shows an error toast if the request fails.
 */
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

/**
 * Show or hide provider-specific form fields based on the selected provider.
 *
 * Reads the value of the `provider` control and sets `hidden` on the
 * `field-openai-key` element unless the provider equals `"openai"`,
 * and sets `hidden` on the `field-or-key` element unless the provider
 * equals `"openrouter"`.
 */
function toggleProviderFields() {
  const p = $('provider').value;
  $('field-openai-key').hidden = p !== 'openai';
  $('field-or-key').hidden = p !== 'openrouter';
}

/**
 * Read configuration values from the page's form controls and return them as a config object.
 * @returns {{provider: string, openaiApiKey: string, openrouterApiKey: string, defaultModel: string, resize: boolean, renamePrompt: string}} An object containing the current form values:
 * - `provider`: selected provider identifier.
 * - `openaiApiKey`: value of the OpenAI API key input.
 * - `openrouterApiKey`: value of the OpenRouter API key input.
 * - `defaultModel`: trimmed model string from the model input.
 * - `resize`: whether the resize checkbox is checked.
 * - `renamePrompt`: value of the rename prompt input.
 */
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

/**
 * Save the configuration read from the form to the server and apply the returned configuration.
 *
 * On success, updates the UI with the new configuration, refreshes the model list, and shows a success toast.
 * On failure, shows an error toast with the failure message.
 */
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

/**
 * Attach a change handler to the preset selector that updates the rename prompt when a preset is chosen.
 *
 * When the selected option's id matches an entry in `currentConfig.promptPresets`, sets the
 * `"rename-prompt"` input's value to the preset's `prompt`.
 */
function wirePresetSelect() {
  $('preset-select').addEventListener('change', () => {
    const id = $('preset-select').value;
    const preset = (currentConfig?.promptPresets || []).find(p => p.id === id);
    if (preset) {
      $('rename-prompt').value = preset.prompt;
    }
  });
}

// Preview
let previewDataUrl = null;
let previewMime = 'image/jpeg';

/**
 * Wires the image preview UI: enables click/keyboard activation, drag-and-drop and file input selection, displays the chosen image, and activates the "run preview" action.
 *
 * When "run preview" is triggered, the selected image is validated and sent to the server as base64 with its MIME type, the current rename prompt, and an optional model; the server response updates the preview result. Errors are surfaced via the UI and toasts.
 */
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
    if (typeof previewDataUrl !== 'string' || !previewDataUrl.includes(',')) {
      $('preview-result').textContent = 'Invalid image data';
      showToast('Could not read the image. Please choose a file again.', true);
      return;
    }
    const base64 = previewDataUrl.split(',')[1];
    if (!base64) {
      $('preview-result').textContent = 'Invalid image data';
      showToast('Could not read the image. Please choose a file again.', true);
      return;
    }
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

/**
 * Attach click handlers for generating and applying batch rename plans.
 *
 * When the "Generate rename plan" button is clicked, this wires a flow that validates the folder path, requests a rename plan from the server, stores the resulting plan and planId in the module-level `lastPlan` and `lastPlanId`, and updates the plan table, status text, and apply-button enabled state; any server or validation errors are shown via toasts. When the "Apply" button is clicked, this confirms the action, posts the stored `planId` to the server to apply renames, and on success clears the stored plan and plan UI; failures are shown via toasts.
 */
function wireBatch() {
  $('plan-batch').addEventListener('click', async () => {
    $('batch-status').textContent = '';
    $('plan-table').hidden = true;
    $('plan-body').innerHTML = '';
    lastPlan = [];
    lastPlanId = null;
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
      lastPlanId = typeof r.planId === 'string' ? r.planId : null;
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
    if (!lastPlanId) {
      showToast('Plan expired or missing. Click “Generate rename plan” again.', true);
      return;
    }
    if (!confirm(`Apply ${lastPlan.length} rename(s)? This cannot be undone automatically.`)) return;
    try {
      await api('/api/apply', {
        method: 'POST',
        body: JSON.stringify({ planId: lastPlanId }),
      });
      showToast('Renames applied');
      lastPlan = [];
      lastPlanId = null;
      $('apply-batch').disabled = true;
      $('plan-table').hidden = true;
      $('plan-body').innerHTML = '';
      $('batch-status').textContent = 'Done.';
    } catch (e) {
      showToast(e.message, true);
    }
  });
}

/**
 * Sets up handlers to manage the Progressive Web App install flow.
 *
 * Captures the `beforeinstallprompt` event to prevent the browser's automatic prompt, stores the event in `deferredInstall`, and makes the in-app install banner visible. When the install button is clicked, prompts the stored install event, waits for the user's choice, clears `deferredInstall`, and hides the install banner.
 */
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

/**
 * Initialize UI wiring, attach event handlers, and perform startup data loading.
 *
 * Wires preset, preview, batch, and install subsystems; registers DOM event listeners
 * for provider changes, saving configuration, refreshing models, and saving presets;
 * then checks server health and attempts to load configuration and model data, updating
 * the UI on failure.
 */
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
