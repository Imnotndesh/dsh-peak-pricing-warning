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

// ── Host half: plain ESM ────────────────────────────────────────────────────
writeFileSync('lib/index.js', [
  '// GENERATED from ' + SOURCE + ' — do not edit. Run `node build.mjs`.',
  '// Host half: plain ESM, imported by the Host Loader.',
  hostFn,
  '',
  'export { host };',
  'export default host;',
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
  clientFn,
  '',
  '    exports.apply = client;',
  '    exports.default = client;',
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n');

writeFileSync('lib/client.js', bundle);

console.log('wrote lib/index.js (ESM host half)');
console.log('wrote lib/client.js (module-loader bundle for ' + PKG_NAME + ')');
