(() => {
  'use strict';

  const CHANNEL = 'sheets-search-text-highlighter-color-v1';
  const DEFAULT_COLOR = '#ffe082';
  let currentColor = DEFAULT_COLOR;
  let revision = 0;

  function normalizeColor(value) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toLowerCase()
      : DEFAULT_COLOR;
  }

  function publishColor() {
    window.postMessage({ channel: CHANNEL, type: 'color', color: currentColor }, window.location.origin);
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.channel === CHANNEL && event.data?.type === 'request-color') publishColor();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, 'highlightColor')) return;
    revision += 1;
    currentColor = normalizeColor(changes.highlightColor.newValue);
    publishColor();
  });

  const initialRevision = revision;
  chrome.storage.local.get({ highlightColor: DEFAULT_COLOR }).then(values => {
    if (revision === initialRevision) currentColor = normalizeColor(values.highlightColor);
  }).catch(() => {
    // The default remains available if extension storage is temporarily unavailable.
  }).finally(publishColor);
})();
