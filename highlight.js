(() => {
  'use strict';

  const SEARCH_SELECTOR = 'input.docs-findinput-input';
  const FORMULA_SELECTOR = '#t-formula-bar-input, .docs-sheet-formula-bar-input';
  const EDITOR_SELECTOR = '#waffle-rich-text-editor';
  const HIGHLIGHT_NAME = 'sheet-search-exact-match-v1';
  const COLOR_CHANNEL = 'sheets-search-text-highlighter-color-v1';
  const DEFAULT_COLOR = '#ffe082';
  let highlightColor = DEFAULT_COLOR;
  let highlightStyle;
  let scheduled = false;

  function textColorFor(background) {
    const channels = [1, 3, 5].map(index => {
      const value = parseInt(background.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return luminance > 0.179 ? '#000000' : '#ffffff';
  }

  function updateStyle() {
    if (!highlightStyle) return;
    highlightStyle.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: ${highlightColor}; color: ${textColorFor(highlightColor)}; }`;
  }

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.channel !== COLOR_CHANNEL || event.data?.type !== 'color') return;
    if (typeof event.data.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(event.data.color)) return;
    highlightColor = event.data.color.toLowerCase();
    updateStyle();
  });
  window.postMessage({ channel: COLOR_CHANNEL, type: 'request-color' }, window.location.origin);

  function visible(element) {
    if (!element || !element.isConnected || !element.getClientRects?.().length) return false;
    const style = window.getComputedStyle?.(element);
    return style?.display !== 'none' && style?.visibility !== 'hidden' && style?.opacity !== '0';
  }

  function ensureStyle() {
    if (highlightStyle?.isConnected) return;
    const parent = document.head || document.documentElement;
    if (!parent) return;
    highlightStyle = document.createElement('style');
    highlightStyle.dataset.sheetSearchExactHighlight = 'true';
    updateStyle();
    parent.appendChild(highlightStyle);
  }

  function rangesInTextNodes(root, query) {
    if (!root || !query || !document.createTreeWalker || !document.createRange || !window.NodeFilter) return [];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let expression;
    try { expression = new RegExp(escaped, 'giu'); }
    catch (_) { return []; }

    const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
    const ranges = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent || '';
      expression.lastIndex = 0;
      let match;
      while ((match = expression.exec(text)) !== null) {
        if (!match[0].length) continue;
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        // Only mark text with real visible DOM geometry; never estimate Canvas glyph positions.
        if (range.getClientRects?.().length) ranges.push(range);
      }
    }
    return ranges;
  }

  function updateHighlights(query) {
    const registry = window.CSS?.highlights;
    registry?.delete(HIGHLIGHT_NAME);
    if (!query || !registry || !window.Highlight) return;

    const ranges = [];
    const editor = document.querySelector(EDITOR_SELECTOR);
    if (visible(editor)) ranges.push(...rangesInTextNodes(editor, query));

    const formula = document.querySelector(FORMULA_SELECTOR);
    if (visible(formula)) ranges.push(...rangesInTextNodes(formula, query));

    if (!ranges.length) return;
    ensureStyle();
    registry.set(HIGHLIGHT_NAME, new window.Highlight(...ranges));
  }

  function render() {
    scheduled = false;
    const input = document.querySelector(SEARCH_SELECTOR);
    const query = visible(input) ? String(input.value || '') : '';
    updateHighlights(query);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function scheduleAfterSheetUpdates() {
    schedule();
    setTimeout(schedule, 60);
    setTimeout(schedule, 180);
  }

  for (const type of ['input', 'change', 'click', 'keydown', 'keyup', 'focusin', 'focusout', 'scroll', 'wheel']) {
    document.addEventListener(type, scheduleAfterSheetUpdates, true);
  }
  window.addEventListener('resize', schedule);
  document.addEventListener('DOMContentLoaded', scheduleAfterSheetUpdates, { once: true });

  const observer = new MutationObserver(records => {
    if (records.some(record => !highlightStyle?.contains(record.target))) schedule();
  });
  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scheduleAfterSheetUpdates();
})();
