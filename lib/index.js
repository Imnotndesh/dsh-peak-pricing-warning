// GENERATED from plugins/peak-pricing-warning/src/plugin.js — do not edit. Run `node build.mjs`.
// Host half: plain ESM, imported by the Host Loader.
function host() {
  const MIN = 60000;

  /** Peak blocks, in minutes from 00:00 UTC, as half-open [start, end). */
  const PEAK_BLOCKS = [[60, 240], [360, 600]];

  /**
   * @param {number} dayUtc - 0=Sunday .. 6=Saturday.
   * @returns {boolean} whether the UTC day is a weekend.
   */
  function treatAsWeekend(dayUtc) {
    return dayUtc === 0 || dayUtc === 6;
  }

  /**
   * Whether an instant falls in a DeepSeek peak window.
   * @param {number} ms - epoch milliseconds.
   * @returns {boolean} true during weekday peak hours.
   */
  function inPeakWindow(ms) {
    const d = new Date(ms);
    if (treatAsWeekend(d.getUTCDay())) return false;
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    for (let i = 0; i < PEAK_BLOCKS.length; i++) {
      if (m >= PEAK_BLOCKS[i][0] && m < PEAK_BLOCKS[i][1]) return true;
    }
    return false;
  }

  /**
   * First minute-aligned instant at or after `fromMs` satisfying `match`.
   * @param {number} fromMs - start of the forward scan.
   * @param {(t: number) => boolean} match - predicate.
   * @returns {number|null} matching instant, or null within the 8-day bound.
   */
  function forward(fromMs, match) {
    let t = Math.ceil(fromMs / MIN) * MIN;
    for (let i = 0; i < 60 * 24 * 8; i++) {
      if (match(t)) return t;
      t += MIN;
    }
    return null;
  }

  /**
   * Last minute-aligned instant at or before `fromMs` satisfying `match`.
   * @param {number} fromMs - start of the backward scan.
   * @param {(t: number) => boolean} match - predicate.
   * @returns {number|null} matching instant, or null within the 8-day bound.
   */
  function backward(fromMs, match) {
    let t = Math.floor(fromMs / MIN) * MIN;
    for (let i = 0; i < 60 * 24 * 8; i++) {
      if (match(t)) return t;
      t -= MIN;
    }
    return null;
  }

  /**
   * Start of the off-peak run governing `nowMs`, and the next peak start.
   *
   * During off-peak the run already in progress is reported, so its start is
   * found by walking BACKWARD to the opening edge (the first off-peak minute
   * whose predecessor was peak). During peak the upcoming run is reported, so
   * its start is found by walking FORWARD. Getting this direction wrong makes
   * an in-progress run appear to start at the current moment, which collapses
   * the countdown to zero.
   *
   * @param {number} nowMs - reference instant.
   * @returns {{offPeakStartMs: number|null, peakStartMs: number|null}} boundaries.
   */
  function windowBounds(nowMs) {
    const peakNow = inPeakWindow(nowMs);
    if (peakNow) {
      return {
        offPeakStartMs: forward(nowMs, (t) => !inPeakWindow(t)),
        peakStartMs: forward(nowMs, (t) => inPeakWindow(t)),
      };
    }
    const offPeakStartMs = backward(nowMs, (t) => !inPeakWindow(t) && inPeakWindow(t - MIN));
    if (offPeakStartMs === null) return { offPeakStartMs: null, peakStartMs: null };
    // Off-peak ends exactly when peak resumes.
    return {
      offPeakStartMs: offPeakStartMs,
      peakStartMs: forward(offPeakStartMs + MIN, (t) => inPeakWindow(t)),
    };
  }

  /**
   * Compute the status payload. Only scalars: this crosses a wire.
   * @returns {object} pricing status for the client.
   */
  function status() {
    const now = Date.now();
    const bounds = windowBounds(now);
    return {
      nowMs: now,
      peak: inPeakWindow(now),
      weekend: treatAsWeekend(new Date(now).getUTCDay()),
      offPeakStartMs: bounds.offPeakStartMs,
      peakStartMs: bounds.peakStartMs,
    };
  }

  // The host half serves its client over an HTTP route on the profile's web
  // server. `harness.handle` is a DYNAMIC-plugin builtin and does not exist in
  // an installed package, so this is the portable form.
  return {
    inject: ['webServer'],
    apply(ctx) {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: '/dsh-peak-pricing-warning/api/peak-status',
        handler: (req, res) => {
          res.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          });
          res.end(JSON.stringify(status()));
        },
      }), 'peak-pricing: status route');
    },
  };
}

export { host };
export default host;
