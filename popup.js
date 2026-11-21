(() => {
  'use strict';

  const DEFAULT_COLOR = '#ffe082';
  const settings = document.querySelector('#color-settings');
  const radios = [...document.querySelectorAll('input[name="highlight-color"]')];
  const customColor = document.querySelector('#custom-color');
  const preview = document.querySelector('#preview-text');
  const status = document.querySelector('#status');
  let pendingColor = null;
  let saving = false;
  let revision = 0;

  function normalizeColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toLowerCase()
      : DEFAULT_COLOR;
  }

  function textColorFor(background) {
    const channels = [1, 3, 5].map(index => {
      const value = parseInt(background.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return luminance > 0.179 ? '#000000' : '#ffffff';
  }

  function render(value) {
    const color = normalizeColor(value);
    for (const radio of radios) radio.checked = radio.value === color;
    customColor.value = color;
    preview.style.backgroundColor = color;
    preview.style.color = textColorFor(color);
  }

  async function selectColor(value) {
    pendingColor = normalizeColor(value);
    render(pendingColor);
    if (saving) return;

    saving = true;
    status.textContent = '';
    let failed = false;
    while (pendingColor !== null) {
      const color = pendingColor;
      pendingColor = null;
      try {
        await chrome.storage.local.set({ highlightColor: color });
        failed = false;
      } catch (_) {
        failed = true;
      }
    }
    saving = false;
    if (failed) status.textContent = '色を保存できませんでした。もう一度選んでください。';
  }

  for (const radio of radios) radio.addEventListener('change', () => {
    if (radio.checked) selectColor(radio.value);
  });
  customColor.addEventListener('input', () => selectColor(customColor.value));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, 'highlightColor')) return;
    revision += 1;
    if (!saving) render(changes.highlightColor.newValue);
  });

  const initialRevision = revision;
  chrome.storage.local.get({ highlightColor: DEFAULT_COLOR }).then(values => {
    if (revision === initialRevision) render(values.highlightColor);
  }).catch(() => {
    status.textContent = '保存した色を読み込めませんでした。もう一度選んでください。';
  }).finally(() => {
    settings.disabled = false;
  });
})();
