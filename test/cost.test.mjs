/**
 * Rate-table and cost-math checks for the cost estimator.
 *
 * Asserts the plugin's rate table reproduces DeepSeek's published per-1M-token
 * figures, so a pricing change surfaces here rather than as a wrong dollar
 * figure in the UI.
 */
import assert from 'node:assert/strict';

// Mirrors RATE_TABLE / OFF_PEAK_MULTIPLIER in plugins/cost-estimator/src/plugin.js.
const RATE_TABLE = {
  'deepseek-flash': { peak: { cacheRead: 0.006, uncachedInput: 0.3, cacheWrite: 0.3, output: 1.2 } },
  'deepseek-v4-pro': { peak: { cacheRead: 0.044, uncachedInput: 1.32, cacheWrite: 1.32, output: 3.96 } },
};
const OFF_PEAK_MULTIPLIER = 0.5;

const cost = (tokens, ratePerMillion) => (tokens / 1e6) * ratePerMillion;

function total(row, mult, u, cr, cw, o) {
  const R = row.peak;
  return (cost(u, R.uncachedInput) + cost(cr, R.cacheRead)
    + cost(cw, R.cacheWrite) + cost(o, R.output)) * mult;
}

// Published values, https://api-docs.deepseek.com/quick_start/pricing
const flash = RATE_TABLE['deepseek-flash'].peak;
const pro = RATE_TABLE['deepseek-v4-pro'].peak;

const published = [
  ['flash cacheHit off-peak', flash.cacheRead * OFF_PEAK_MULTIPLIER, 0.003],
  ['flash cacheMiss off-peak', flash.uncachedInput * OFF_PEAK_MULTIPLIER, 0.15],
  ['flash output off-peak', flash.output * OFF_PEAK_MULTIPLIER, 0.6],
  ['flash cacheHit peak', flash.cacheRead, 0.006],
  ['flash cacheMiss peak', flash.uncachedInput, 0.3],
  ['flash output peak', flash.output, 1.2],
  ['pro cacheHit off-peak', pro.cacheRead * OFF_PEAK_MULTIPLIER, 0.022],
  ['pro cacheMiss off-peak', pro.uncachedInput * OFF_PEAK_MULTIPLIER, 0.66],
  ['pro output off-peak', pro.output * OFF_PEAK_MULTIPLIER, 1.98],
  ['pro cacheHit peak', pro.cacheRead, 0.044],
  ['pro cacheMiss peak', pro.uncachedInput, 1.32],
  ['pro output peak', pro.output, 3.96],
];

for (const [name, got, want] of published) {
  assert.ok(Math.abs(got - want) < 1e-9, `${name}: got ${got}, want ${want}`);
}

// Peak must be exactly double off-peak, which is how the plugin derives it.
const usage = [200000, 2000000, 50000, 60000];
const off = total(RATE_TABLE['deepseek-flash'], OFF_PEAK_MULTIPLIER, ...usage);
const peak = total(RATE_TABLE['deepseek-flash'], 1, ...usage);
assert.ok(Math.abs(peak / off - 2) < 1e-9, 'peak must be exactly 2x off-peak');

// Cache reads must be far cheaper than uncached input, or the whole
// "keep the cache warm" premise the pill reports would be meaningless.
assert.ok(flash.cacheRead < flash.uncachedInput / 10, 'cache read should be >10x cheaper');

console.log('cost.test.mjs: all rate checks pass');
console.log('  flash off-peak sample: $' + off.toFixed(4) + '  peak: $' + peak.toFixed(4));
console.log('  pro   off-peak sample: $' + total(RATE_TABLE['deepseek-v4-pro'], 0.5, ...usage).toFixed(4));
