/**
 * Boundary tests for the peak/off-peak schedule.
 *
 * The schedule is invisible until it is wrong, so every boundary SHAPE is
 * exercised: both peak blocks, the gap between them, both weekend edges, and
 * the return to peak after a weekend.
 *
 * The subtle assertion is that the countdown target is always in the FUTURE.
 * Finding an off-peak run's start by scanning forward instead of backward
 * makes the next peak look like "now", collapsing the countdown to 0m 00s for
 * the whole off-peak stretch.
 */
import assert from 'node:assert/strict';
import { host } from '../plugins/peak-pricing-warning/src/plugin.js';

let handler = null;
globalThis.harness = { handle: (name, fn) => { handler = fn; } };
host().apply({});
assert.ok(typeof handler === 'function', 'host must register a peak-status handler');

const at = (ms) => { Date.now = () => ms; };
const realNow = Date.now;

const cases = [
  ['Thu 01:30Z peak block 1', Date.UTC(2026, 8, 10, 1, 30), true, false],
  ['Thu 06:30Z peak block 2', Date.UTC(2026, 8, 10, 6, 30), true, false],
  ['Thu 04:30Z gap between blocks', Date.UTC(2026, 8, 10, 4, 30), false, false],
  ['Thu 16:13Z weekday off-peak', Date.UTC(2026, 8, 10, 16, 13), false, false],
  ['Sat 03:00Z weekend (would be peak)', Date.UTC(2026, 8, 12, 3, 0), false, true],
  ['Sun 08:00Z weekend', Date.UTC(2026, 8, 13, 8, 0), false, true],
  ['Mon 00:30Z weekend tail', Date.UTC(2026, 8, 14, 0, 30), false, false],
  ['Mon 01:30Z peak after weekend', Date.UTC(2026, 8, 14, 1, 30), true, false],
];

try {
  for (const [name, ms, wantPeak, wantWeekend] of cases) {
    at(ms);
    const r = handler();

    assert.equal(r.peak, wantPeak, `${name}: peak`);
    assert.equal(r.weekend, wantWeekend, `${name}: weekend`);
    assert.equal(r.nowMs, ms, `${name}: nowMs echoes the clock`);

    // JSON must survive the RPC boundary with no loss.
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r, `${name}: lossless JSON`);

    const target = r.peak ? r.offPeakStartMs : r.peakStartMs;
    assert.ok(typeof target === 'number', `${name}: target must resolve`);
    assert.ok(target > r.nowMs, `${name}: target must be in the future`);
  }
} finally {
  Date.now = realNow;
}

console.log(`peak.test.mjs: all ${cases.length} boundary cases pass`);
