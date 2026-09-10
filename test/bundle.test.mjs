/**
 * Bundle-shape tests for the installed client half.
 *
 * These guard the failures that are hardest to diagnose in the browser, because
 * each presents as something other than itself:
 *
 *   - A missing `__ModuleLoader__.load` call fails the WHOLE combo request, so
 *     every other package in it reports "loaded without registering <package>",
 *     naming an innocent bystander rather than this file.
 *
 *   - Exporting the authored FACTORY instead of the plugin's own fields means
 *     the module loads, the factory materializes, and the Loader's call to
 *     `exports.apply(ctx)` merely constructs a plugin object and throws it away.
 *     Nothing errors; nothing renders. That was a real bug.
 *
 * The test drives the built artifact through a stub of the browser module
 * loader, so it needs no browser and no Harness runtime.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NAME = '@imnotndesh/dsh-peak-pricing-warning';
const source = readFileSync('lib/client.js', 'utf8');

// ---- Recreate the browser's module-loader handshake. ----
let registration = null;
const windowStub = { __ModuleLoader__: { load: (def) => { registration = def; } } };
const documentStub = {
  head: { appendChild: () => {} },
  createElement: () => ({ dataset: {}, style: {} }),
};

new Function('window', 'document', source)(windowStub, documentStub);

assert.ok(registration !== null, 'bundle must call window.__ModuleLoader__.load');
assert.equal(registration.id, NAME, 'bundle must register under its package name');
assert.equal(typeof registration.factory, 'function', 'registration needs a factory');

// ---- Materialize the factory the way the runtime does. ----
const React = {
  createElement: (type, props, children) => ({ type, props, children }),
  useMemo: (fn) => fn(),
  useSyncExternalStore: () => null,
};

const exports = registration.factory((specifier) => {
  if (specifier === 'react') return React;
  throw new Error(`unexpected require("${specifier}") — declared externals must resolve`);
});

// The Loader reads these fields directly off the module exports.
assert.equal(typeof exports.apply, 'function', 'exports.apply must be a function');
assert.ok(Array.isArray(exports.inject), 'exports.inject must be an array');
assert.ok(exports.inject.includes('slots'), 'the plugin needs the slots service');

// The decisive assertion: apply must BE the plugin's apply, not the authored
// factory. A factory accepts no context and returns an object; the real apply
// takes ctx and registers. Confirm by driving it and observing registration.
const seen = [];
const slots = {
  inject: (key, callback) => { seen.push(`inject:${key}`); callback(); },
  register: (options) => { seen.push(`register:${options.id}`); return () => {}; },
};

let effects = 0;
const ctx = {
  get: (name) => (name === 'slots' ? slots : undefined),
  effect: (fn) => { effects += 1; fn(); return () => {}; },
  interval: () => () => {},
};

exports.apply(ctx);

assert.equal(effects, 1, 'apply should install exactly one effect (the stylesheet)');
assert.ok(
  seen.includes('inject:conversation.input.left'),
  'apply must wait on the composer slot; if this fails, exports.apply is the factory, not the plugin',
);
assert.ok(
  seen.includes('register:peak-pricing'),
  'apply must register the badge into the composer slot',
);

// ---- The host half must be plain ESM with no loader wrapper. ----
const hostSource = readFileSync('lib/index.js', 'utf8');
assert.ok(
  !hostSource.includes('__ModuleLoader__'),
  'the host half is imported by the Host Loader and must not carry a browser wrapper',
);

console.log('bundle.test.mjs: client half registers, materializes, and renders its slot');
console.log('  registered id :', registration.id);
console.log('  exports       :', Object.keys(exports).join(', '));
console.log('  apply trace   :', seen.join(' -> '));
