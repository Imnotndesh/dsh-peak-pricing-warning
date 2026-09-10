/**
 * Split the single verified source file into the two module halves the
 * `dsh.bundle` install path expects, so there is one source of truth.
 *
 *   plugins/peak-pricing-warning/src/plugin.js  ->  lib/index.js (host)
 *                                              ->  lib/client.js (client)
 */
import { host, client } from './plugins/peak-pricing-warning/src/plugin.js';
import { writeFileSync } from 'node:fs';

function emit(name, fn, header) {
  const src = fn.toString();
  return `${header}\n${src}\n\nexport { ${name} };\nexport default ${name};\n`;
}

writeFileSync('lib/index.js', emit(
  'host',
  host,
  '// GENERATED from plugins/peak-pricing-warning/src/plugin.js — do not edit.\n' +
  '// Host half: authoritative peak/off-peak computation from the Host clock.\n' +
  '// DeepSeek peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday-Friday.',
));

writeFileSync('lib/client.js', emit(
  'client',
  client,
  '// GENERATED from plugins/peak-pricing-warning/src/plugin.js — do not edit.\n' +
  '// Client half: one badge in conversation.input.left, beside the model selector.',
));

console.log('wrote lib/index.js and lib/client.js');
