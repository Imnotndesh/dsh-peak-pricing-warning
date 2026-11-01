/**
 * Emit the two module halves a DSH plugin package must ship.
 *
 * Modelled on published, working plugins from the dsh-plugin ecosystem rather
 * than reverse-engineered, because the installed path differs from the dynamic
 * (cordis_define) path in four concrete ways:
 *
 *   concern        dynamic plugin          installed package
 *   -------------  ----------------------  --------------------------------
 *   client shape   bare function body      __ModuleLoader__.load({id, factory})
 *   React          injected parameter      require("react")
 *   CSS            styles.insert(css)      a <style> element in document
 *   host call      host.call / harness     webServer route + fetch
 *
 * Getting the client shape wrong is not a local failure: the combo route serves
 * every client bundle concatenated as ONE script, so a bundle that never calls
 * __ModuleLoader__.load breaks the whole request and every other package in it
 * reports "loaded without registering <innocent bystander>".
 *
 * The plugin is authored once in plugins/*\/src/plugin.js in the dynamic form,
 * and this build emits the installed form. The authored body is included
 * verbatim (never rewritten) so the two cannot drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'plugins/peak-pricing-warning/src/plugin.js';
const PKG = JSON.parse(readFileSync('package.json', 'utf8'));
const PKG_NAME = PKG.name;

const src = readFileSync(SOURCE, 'utf8');

/**
 * Extract a top-level `function <name>() { ... }` by brace matching.
 * @param {string} text - module source.
 * @param {string} name - function name.
 * @returns {string} the function source including the `function` keyword.
 */
function extractFunction(text, name) {
  const start = text.indexOf('\nfunction ' + name + '(');
  if (start === -1) throw new Error(`plugin source has no top-level function ${name}()`);
  const brace = text.indexOf('{', start);
  if (brace === -1) throw new Error(`malformed ${name}()`);
  let depth = 0;
  for (let j = brace; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start + 1, j + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}()`);
}

const hostFn = extractFunction(src, 'host');
const clientFn = extractFunction(src, 'client');

/**
 * Module-scope code a generated half needs: every `#region` other than `host`
 * and `client`, minus the file header and the trailing `export` statement.
 * Today that is the `rates` region — the table `client()` prices from.
 *
 * Emitting only the two factories therefore dropped `RATE_TABLE`,
 * `OFF_PEAK_MULTIPLIER` and `resolveRates` from the browser bundle even though
 * `client()` calls them: the first render that priced a session threw
 * `ReferenceError: resolveRates is not defined`, the slot's error boundary
 * blacked out that cell, and the badge was gone from the composer.
 *
 * Selecting by region rather than by name means a later shared declaration is
 * carried into the bundle without another edit here.
 */
const moduleScope = src
  .replace(/\/\/ #region host[\s\S]*?\/\/ #endregion host/, '')
  .replace(/\/\/ #region client[\s\S]*?\/\/ #endregion client/, '')
  .replace(/^\/\*\*[\s\S]*?\*\/\r?\n/, '')
  .split('\n')
  .filter((line) => !/^\s*export\s/.test(line))
  .join('\n')
  .trim();

// ── Host half: plain ESM ────────────────────────────────────────────────────
// The authored body is a FACTORY: `host()` yields { inject, apply }. A bundle
// must instead export the plugin's OWN fields, because the Host Loader runs
// `unwrapExports` (= `exports.default ?? exports`) and then looks for `apply`
// and `inject` on that value.
//
// Exporting the factory as `default` makes the Loader take `host` as the
// plugin callback. A `function` declaration has a prototype, so Cordis takes
// its constructor branch (`new host(ctx, config)`), keeps only the returned
// object's init hooks, and discards the plugin object — `apply` never runs, the
// route is never registered, and nothing is logged. Calling the factory here
// and re-exporting its fields is the fix, exactly as the client half does.
//
// Deliberately NO `export default`: a default export collapses the module in
// `unwrapExports` and takes `inject` down with it. The host half needs no
// module-scope code, so none is emitted into it.
writeFileSync('lib/index.js', [
  '// GENERATED from ' + SOURCE + ' — do not edit. Run `node build.mjs`.',
  '// Host half: plain ESM, imported by the Host Loader.',
  hostFn,
  '',
  'const plugin = host();',
  'export const inject = plugin.inject;',
  'export const apply = plugin.apply;',
  '',
].join('\n'));

// ── Client half: module-loader bundle ───────────────────────────────────────
// The authored body expects `React`, `styles` and `host` as ambient names.
// Here each is supplied explicitly:
//   React  from the shared module table, so there is one React instance.
//   styles a minimal insert() shim over a <style> element, matching the
//          dynamic builtin's contract and returning a disposer.
//   host   a fetch-backed shim over this package's own webServer route, so the
//          authored `host.call('peak-status', {})` keeps working unchanged.
const bundle = [
  '// GENERATED from ' + SOURCE + ' — do not edit. Run `node build.mjs`.',
  '// Client half: module-loader bundle. The __ModuleLoader__.load call is the',
  '// handshake the browser module system requires; omitting it fails the whole',
  '// combo request rather than merely this package.',
  'window.__ModuleLoader__.load({',
  '  id: ' + JSON.stringify(PKG_NAME) + ',',
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  '    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
  '',
  '    var React = require("react");',
  '',
  '    // styles.insert(css) over a package-owned <style> element.',
  '    var styles = {',
  '      insert: function (css) {',
  '        var el = document.createElement("style");',
  '        el.dataset.plugin = ' + JSON.stringify(PKG_NAME) + ';',
  '        el.textContent = css;',
  '        document.head.appendChild(el);',
  '        return function () {',
  '          if (el.parentNode !== null) el.parentNode.removeChild(el);',
  '        };',
  '      },',
  '    };',
  '',
  '    // host.call(method, args) over this package\'s own webServer route.',
  '    var HOST_ROUTE = "/dsh-peak-pricing-warning/api/";',
  '    var host = {',
  '      call: function (method, args) {',
  '        return fetch(HOST_ROUTE + encodeURIComponent(method), {',
  '          method: "POST",',
  '          headers: { "content-type": "application/json" },',
  '          body: JSON.stringify(args === undefined ? null : args),',
  '        }).then(function (response) {',
  '          if (!response.ok) throw new Error("host call " + method + " failed: HTTP " + response.status);',
  '          return response.json();',
  '        });',
  '      },',
  '    };',
  '',
  moduleScope,
  '',
  clientFn,
  '',
  '    // The authored body is a FACTORY in the dynamic form: the evaluator does',
  '    // `new Function(...)(code)` and expects the code to `return` a plugin, so',
  '    // `client()` yields { inject, apply }. A bundle must instead export the',
  '    // plugin\'s own fields, because the Loader reads `exports.apply` and',
  '    // `exports.inject` directly. Calling the factory here bridges the two.',
  '    var plugin = client();',
  '    exports.apply = plugin.apply;',
  '    if (plugin.inject !== undefined) exports.inject = plugin.inject;',
  '    exports.default = plugin;',
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n');

writeFileSync('lib/client.js', bundle);

console.log('wrote lib/index.js (ESM host half)');
console.log('wrote lib/client.js (module-loader bundle for ' + PKG_NAME + ')');
