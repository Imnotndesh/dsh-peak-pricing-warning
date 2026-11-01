/**
 * Render regression test for the installed client half.
 *
 * This is the test that was missing. `bundle.test.mjs` proves the module
 * registers and that `apply` reaches the slot, but it stops there — it never
 * renders a badge with token usage, so it could not see that `resolveRates`
 * and `OFF_PEAK_MULTIPLIER` were absent from `lib/client.js`. Every render with
 * usage threw `ReferenceError: resolveRates is not defined`, and the slot's
 * error boundary then removed the entry: the badge simply vanished, with no
 * error in the Host log.
 *
 * The test drives the real built bundle with stubs for React, the DOM, the
 * model directory, and the Host route, then asserts the priced cost string.
 * It needs no browser and no Harness runtime.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NAME = '@imnotndesh/dsh-peak-pricing-warning';
const source = readFileSync('lib/client.js', 'utf8');

// ---- The status the Host route would answer: weekday off-peak, peak in 1h. ----
const NOW = 1_800_000_000_000;
const STATUS = {
  nowMs: NOW,
  peak: false,
  weekend: false,
  offPeakStartMs: NOW - 3_600_000,
  peakStartMs: NOW + 3_600_000,
};

// ---- Browser stubs ----------------------------------------------------------
let registration = null;
const windowStub = { __ModuleLoader__: { load: (def) => { registration = def; } } };
const documentStub = {
  head: { appendChild: () => {} },
  createElement: () => ({ dataset: {}, style: {} }),
};

let hostCalls = 0;
globalThis.fetch = async () => {
  hostCalls += 1;
  return { ok: true, status: 200, json: async () => STATUS };
};

// Minimal hook surface: memo runs its factory; useSyncExternalStore subscribes
// (which starts the fetch / model probe) and returns the current snapshot.
// createElement mirrors React's element shape, children included in `props`.
const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: {
      ...props,
      children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children,
    },
  }),
  useMemo: (factory) => factory(),
  useSyncExternalStore: (subscribe, getSnapshot) => {
    subscribe(() => {});
    return getSnapshot();
  },
};

new Function('window', 'document', source)(windowStub, documentStub);
assert.ok(registration !== null, 'bundle must call window.__ModuleLoader__.load');

const exports_ = registration.factory((specifier) => {
  if (specifier === 'react') return React;
  throw new Error(`unexpected require("${specifier}")`);
});

// ---- Capture the registered component --------------------------------------
let Component = null;
const slots = {
  inject: (key, callback) => { callback(); },
  register: (options, renderer) => { Component = renderer; return () => {}; },
};

const modelStore = {
  getSnapshot: () => ({ current: { provider: 'deepseek', model: 'deepseek-v4-flash' } }),
  subscribe: () => () => {},
};

const ctx = {
  get: (name) => {
    if (name === 'slots') return slots;
    if (name === 'modelDirectories') return { directoryFor: () => ({ store: modelStore }) };
    return undefined;
  },
  effect: (fn) => {
    const result = fn();
    return typeof result === 'function' ? result : () => {};
  },
  interval: () => () => {},
};

exports_.apply(ctx);
assert.ok(Component !== null, 'apply must register the badge component');

// The registered renderer is `(props) => createElement(PeakBadge, props)`, i.e.
// it builds the element the renderer would mount. Drive the inner component.
const render = (props) => {
  const element = Component(props);
  assert.ok(element !== null, 'badge must render an element');
  return typeof element.type === 'function' ? element.type(element.props) : element;
};

// 1M uncached input + 1M output at Flash peak rates, halved for off-peak:
// (0.30 + 1.20) * 0.5 = 0.75 -> "$0.750"
const usage = {
  uncachedInputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 1_000_000,
};
const props = {
  sessionId: 'session-1',
  useProjection: (key) => (key === 'tokenUsage' ? usage : undefined),
};

// First render: subscribes, kicks the Host fetch, and shows the pending label.
const pending = render(props);
assert.equal(pending.props.children, 'Checking pricing\u2026', 'first render must show the pending state');

// Let the stubbed Host call settle, then render with a status available.
await new Promise((resolve) => setTimeout(resolve, 20));
assert.ok(hostCalls > 0, 'subscribing must fetch the Host clock');

const badge = render(props); // pre-fix this line threw ReferenceError

// ---- Assert the priced badge ----------------------------------------------
const kids = Array.isArray(badge.props.children) ? badge.props.children : [];
const byClass = (name) => kids.find((child) => child && child.props && child.props.className === name);

assert.ok(byClass('dshPeakDot'), 'badge must render its status dot');
assert.equal(byClass('dshPeakLabel').props.children, 'Off-peak', 'weekday off-peak label');
assert.match(String(byClass('dshPeakMeta').props.children), /^Peak in /, 'countdown must target the next peak');

const cost = byClass('dshPeakCost');
assert.ok(cost, 'usage must produce a cost figure');
assert.equal(cost.props.children, '$0.750', 'cost must price the four buckets at half the peak rate');
assert.match(String(badge.props.title), /Estimated session cost/, 'hover must carry the estimate caveat');

console.log('render.test.mjs: badge renders with usage and prices the session');
console.log('  label    :', byClass('dshPeakLabel').props.children);
console.log('  countdown:', byClass('dshPeakMeta').props.children);
console.log('  cost     :', cost.props.children);
