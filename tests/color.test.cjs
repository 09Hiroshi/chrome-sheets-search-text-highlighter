const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const popupHtml = read('popup.html');
const colors = [...popupHtml.matchAll(/type="radio" name="highlight-color" value="(#[0-9a-f]{6})"/g)].map(m => m[1]);
const tick = () => new Promise(resolve => setImmediate(resolve));

function contrastRatio(background, foreground) {
  const luminance = color => {
    const channels = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function storageMock(initial = {}) {
  const data = { ...initial };
  const listeners = [];
  let rejectNext = false;
  const chrome = { storage: {
    local: {
      async get(defaults) { return { ...defaults, ...data }; },
      async set(values) {
        await Promise.resolve();
        if (rejectNext) { rejectNext = false; throw Error('storage failure'); }
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          changes[key] = { oldValue: data[key], newValue: value };
          data[key] = value;
        }
        for (const listener of listeners) listener(changes, 'local');
      }
    },
    onChanged: { addListener(listener) { listeners.push(listener); } }
  } };
  return { chrome, data, failNext() { rejectNext = true; } };
}

function control(value = '') {
  return {
    value, checked: false, disabled: false, textContent: '', style: {}, listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    fire(type) { if (this.listeners[type]) this.listeners[type]({ target: this }); }
  };
}

function openPopup(storage) {
  const radios = colors.map(control);
  const settings = control();
  const custom = control('#ffe082');
  const preview = control();
  const status = control();
  const elements = { '#color-settings': settings, '#custom-color': custom, '#preview-text': preview, '#status': status };
  const document = {
    querySelector(selector) { return elements[selector]; },
    querySelectorAll() { return radios; }
  };
  vm.runInNewContext(read('popup.js'), { document, chrome: storage.chrome, console });
  return { radios, settings, custom, preview, status };
}

async function openSheet(storage, order) {
  const listeners = [];
  const styles = [];
  const parent = { appendChild(style) { style.isConnected = true; styles.push(style); } };
  const editor = { isConnected: true, getClientRects: () => [1] };
  const search = { isConnected: true, value: 'needle', getClientRects: () => [1] };
  const document = {
    head: parent, documentElement: parent,
    querySelector(selector) {
      if (selector === 'input.docs-findinput-input') return search;
      if (selector === '#waffle-rich-text-editor') return editor;
      return null;
    },
    createElement() { return { dataset: {}, isConnected: false, textContent: '', contains: () => false }; },
    createTreeWalker() {
      let used = false;
      return { nextNode() { if (used) return null; used = true; return { textContent: 'a needle' }; } };
    },
    createRange() { return { setStart() {}, setEnd() {}, getClientRects: () => [1] }; },
    addEventListener() {}
  };
  const win = {
    location: { origin: 'https://docs.google.com' },
    CSS: { highlights: new Map() }, NodeFilter: { SHOW_TEXT: 4 },
    Highlight: class Highlight { constructor(...ranges) { this.ranges = ranges; } },
    getComputedStyle() { return { display: 'block', visibility: 'visible', opacity: '1' }; },
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); },
    postMessage(data, origin) {
      queueMicrotask(() => listeners.forEach(fn => fn({ source: win, origin, data })));
    }
  };
  const ctx = { window: win, document, chrome: storage.chrome, console,
    requestAnimationFrame: cb => setImmediate(cb), setTimeout() {},
    MutationObserver: class { observe() {} } };
  const first = order === 'main-first' ? 'highlight.js' : 'color-bridge.js';
  const second = order === 'main-first' ? 'color-bridge.js' : 'highlight.js';
  vm.runInNewContext(read(first), ctx);
  await tick();
  vm.runInNewContext(read(second), ctx);
  await tick();
  await tick();
  assert.equal(styles.length, 1, 'a highlight style is created');
  assert.equal(win.CSS.highlights.get('sheet-search-exact-match-v1').ranges.length, 1);
  return { win, style: styles[0] };
}

async function main() {
  assert.equal(colors.length, 8);
  assert.equal(new Set(colors).size, 8);
  assert.equal(colors[0], '#ffe082');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.content_scripts.find(s => s.js.includes('color-bridge.js')).world, 'ISOLATED');
  assert.equal(manifest.content_scripts.find(s => s.js.includes('highlight.js')).world, 'MAIN');
  for (const item of manifest.content_scripts) for (const file of item.js) assert.ok(fs.existsSync(path.join(root, file)));

  const storage = storageMock();
  const first = await openSheet(storage, 'bridge-first');
  const second = await openSheet(storage, 'main-first');
  const popup = openPopup(storage);
  await tick();
  assert.equal(popup.settings.disabled, false);
  assert.equal(popup.radios[0].checked, true);
  assert.match(first.style.textContent, /background-color: #ffe082; color: #000000/);
  for (const radio of popup.radios) {
    radio.checked = true;
    radio.fire('change');
    await tick();
    assert.equal(storage.data.highlightColor, radio.value);
    assert.ok(first.style.textContent.includes(`background-color: ${radio.value};`));
    assert.ok(second.style.textContent.includes(`background-color: ${radio.value};`));
    assert.ok(contrastRatio(radio.value, popup.preview.style.color) >= 4.5);
  }

  popup.custom.value = '#101010';
  popup.custom.fire('input');
  await tick();
  assert.equal(storage.data.highlightColor, '#101010');
  assert.equal(popup.radios.some(radio => radio.checked), false);
  assert.equal(popup.preview.style.color, '#ffffff');
  assert.ok(contrastRatio('#101010', popup.preview.style.color) >= 4.5);
  assert.match(first.style.textContent, /background-color: #101010; color: #ffffff/);
  assert.match(second.style.textContent, /background-color: #101010; color: #ffffff/);

  const reopened = openPopup(storage);
  await tick();
  assert.equal(reopened.custom.value, '#101010');
  assert.equal(reopened.preview.style.backgroundColor, '#101010');
  const third = await openSheet(storage, 'bridge-first');
  assert.match(third.style.textContent, /background-color: #101010; color: #ffffff/);

  popup.custom.value = '#ffffff';
  popup.custom.fire('input');
  popup.custom.value = '#123456';
  popup.custom.fire('input');
  await tick();
  assert.equal(storage.data.highlightColor, '#123456', 'rapid changes retain the last choice');
  assert.ok(first.style.textContent.includes('background-color: #123456;'));

  first.win.postMessage({ channel: 'sheets-search-text-highlighter-color-v1', type: 'color', color: '#fff; color:red' }, first.win.location.origin);
  await tick();
  assert.ok(first.style.textContent.includes('background-color: #123456;'), 'invalid colors cannot enter CSS');

  storage.failNext();
  popup.custom.value = '#000000';
  popup.custom.fire('input');
  await tick();
  assert.match(popup.status.textContent, /保存できませんでした/);
  assert.equal(storage.data.highlightColor, '#123456');
  console.log('PASS: 8 presets, default, custom colors, contrast, live updates in multiple sheets, persistence, startup order, rapid changes, invalid input and storage failure');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
