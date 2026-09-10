/**
 * DeepSeek Cost Estimator — a DeepSeek Harness dynamic plugin.
 *
 * Shows a running session cost estimate beside the composer, broken down by
 * DeepSeek's four billing buckets, updating as the session progresses.
 *
 *   ⛁ $0.0234 · 128.4k tok · 96% cached
 *
 * Where the numbers come from
 * ---------------------------
 * DeepSeek bills four token classes at different rates, and the Harness already
 * tracks all four exactly. The `tokenUsage` session projection (owned by
 * @deepseek-ai/dsh-token-meter) exposes them as disjoint cumulative buckets for
 * the whole durable session log:
 *
 *   uncachedInputTokens  cacheReadTokens  cacheWriteTokens  outputTokens
 *
 * So this plugin does NOT count tokens. It reads that projection and applies a
 * rate table. Reasoning tokens are already inside `outputTokens`, so they are
 * priced once and never double-counted.
 *
 * This is an ESTIMATE, not a bill. It prices the buckets at published list rates
 * for the model currently selected and cannot see discounts, credits, retries
 * billed by a different route, or a mid-session model switch that splits usage
 * across two price levels. The harness ships no rate table, so the one below is
 * this plugin's own and may lag a pricing change — see README.
 *
 * Pricing source: https://api-docs.deepseek.com/quick_start/pricing
 */

// #region rates

/**
 * Published DeepSeek list rates in USD per 1M tokens.
 *
 * `cacheWrite` is derived, not quoted: DeepSeek documents cache HIT at a
 * discount and does not publish a separate write premium, so a cache write is
 * billed as an ordinary uncached input token. Change this one field if that
 * ever stops being true.
 *
 * Peak and off-peak differ by exactly 2x, so off-peak is derived rather than
 * duplicated — one number to update per model when prices change.
 */
const RATE_TABLE = {
  'deepseek-flash': {
    label: 'DeepSeek Flash',
    peak: { cacheRead: 0.006, uncachedInput: 0.3, cacheWrite: 0.3, output: 1.2 },
  },
  'deepseek-v4-pro': {
    label: 'DeepSeek V4 Pro',
    peak: { cacheRead: 0.044, uncachedInput: 1.32, cacheWrite: 1.32, output: 3.96 },
  },
};

/** DeepSeek off-peak is exactly half of peak. */
const OFF_PEAK_MULTIPLIER = 0.5;

/**
 * Resolve a model id to a rate row.
 * Matches on the model string, so a provider prefix or a dated suffix still
 * resolves. Falls back to Flash, the cheaper route, and reports that it did.
 *
 * @param {string} modelId - model id from the model directory.
 * @returns {{row: object, key: string, exact: boolean}} resolved rate row.
 */
function resolveRates(modelId) {
  const id = typeof modelId === 'string' ? modelId.toLowerCase() : '';
  if (id.indexOf('pro') !== -1 && id.indexOf('deepseek') !== -1) {
    return { row: RATE_TABLE['deepseek-v4-pro'], key: 'deepseek-v4-pro', exact: true };
  }
  if (id.indexOf('deepseek') !== -1) {
    return { row: RATE_TABLE['deepseek-flash'], key: 'deepseek-flash', exact: true };
  }
  return { row: RATE_TABLE['deepseek-flash'], key: 'deepseek-flash', exact: false };
}

// #endregion rates

// #region host

/**
 * Host half. Owns the peak/off-peak determination, since the discount is a
 * function of the Host clock rather than anything the page knows.
 *
 * The schedule matches the sibling peak-pricing-warning plugin:
 *   peak = 01:00-04:00 and 06:00-10:00 UTC, Monday through Friday.
 *
 * @returns {object} a Cordis Plugin.
 */
function host() {
  const MIN = 60000;
  const PEAK_BLOCKS = [[60, 240], [360, 600]];

  /**
   * @param {number} dayUtc - 0=Sunday .. 6=Saturday.
   * @returns {boolean} whether the UTC day is a weekend.
   */
  function isWeekend(dayUtc) {
    return dayUtc === 0 || dayUtc === 6;
  }

  /**
   * @param {number} ms - epoch milliseconds.
   * @returns {boolean} whether the instant is in a peak window.
   */
  function inPeak(ms) {
    const d = new Date(ms);
    if (isWeekend(d.getUTCDay())) return false;
    const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    for (let i = 0; i < PEAK_BLOCKS.length; i++) {
      if (m >= PEAK_BLOCKS[i][0] && m < PEAK_BLOCKS[i][1]) return true;
    }
    return false;
  }

  return {
    apply() {
      // The price multiplier is the only thing the Client cannot derive.
      harness.handle('cost-peak', () => {
        const now = Date.now();
        const peak = inPeak(now);
        return {
          nowMs: now,
          peak: peak,
          multiplier: peak ? 1 : OFF_PEAK_MULTIPLIER,
        };
      });
    },
  };
}

// #endregion host

// #region client

/**
 * Client half. Registers one cost pill in `conversation.composer.dock`, beside
 * the shipped t/s and usage-donut pills.
 *
 * Snapshot rules learned the hard way and kept here:
 *  1. `useSyncExternalStore` compares by reference, so every getSnapshot must
 *     return a primitive or the SAME object until the value changes.
 *  2. The poll is refcounted and always re-fetches on subscribe, so a first
 *     fetch that races Host registration recovers instead of hanging.
 *
 * @returns {object} a Cordis Plugin.
 */
function client() {
  // Matches the shipped stats pills in the same row (`conversation.composer.dock`)
  // so the cost reads as one more stat rather than a separate widget. Colours are
  // the same tertiary label token the t/s and usage pills use.
  const CSS = [
    '.dshCost{box-sizing:border-box;max-width:100%;',
    'color:var(--dsw-alias-label-tertiary);font:inherit;',
    'font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;',
    'background:0 0;border:none;border-radius:24px;',
    'align-items:center;gap:6px;padding:1px 8px;display:inline-flex;}',
    '.dshCostLabel{text-overflow:ellipsis;min-width:0;overflow:hidden;}',
    '.dshCostSep{opacity:0.6;}',
    '.dshCostPeak{color:#e02b2b;}',
  ].join('');

  /**
   * Compact token count: 950, 12.4k, 1.28M.
   * @param {number} n - token count.
   * @returns {string} compact representation.
   */
  function formatTokens(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '0';
    if (n < 1000) return String(Math.round(n));
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k';
    return (n / 1e6).toFixed(2) + 'M';
  }

  /**
   * USD amount, with enough precision to stay useful when it is tiny.
   * @param {number} usd - dollar amount.
   * @returns {string} formatted amount.
   */
  function formatUsd(usd) {
    if (typeof usd !== 'number' || !isFinite(usd) || usd <= 0) return '$0.00';
    if (usd < 0.01) return '$' + usd.toFixed(4);
    if (usd < 1) return '$' + usd.toFixed(3);
    return '$' + usd.toFixed(2);
  }

  /**
   * Cost of one bucket at a rate, in USD.
   * @param {number} tokens - token count.
   * @param {number} ratePerMillion - USD per 1M tokens.
   * @returns {number} cost in USD.
   */
  function bucketCost(tokens, ratePerMillion) {
    if (typeof tokens !== 'number' || !isFinite(tokens) || tokens <= 0) return 0;
    return (tokens / 1e6) * ratePerMillion;
  }

  return {
    inject: ['timer', 'slots'],
    apply(ctx) {
      ctx.effect(() => styles.insert(CSS), 'dsh-cost-estimator');

      // ── Shared peak-state clock ───────────────────────────────────────────
      let peakState = null;
      let lastError = false;
      let subscribers = 0;
      let stopPoll = null;
      let inFlight = false;
      const listeners = new Set();

      const emit = () => {
        for (const fn of Array.from(listeners)) {
          try { fn(); } catch (err) { console.error('cost-estimator listener failed', err); }
        }
      };

      /**
       * Publish peak state, reusing the reference when nothing changed.
       * @param {object} next - freshly built state.
       */
      const publish = (next) => {
        const prev = peakState;
        if (prev !== null && prev.peak === next.peak && prev.multiplier === next.multiplier) {
          prev.nowMs = next.nowMs;
          return;
        }
        peakState = next;
      };

      const refresh = () => {
        if (inFlight) return;
        inFlight = true;
        host.call('cost-peak', {}).then((next) => {
          inFlight = false;
          if (next !== null && typeof next === 'object') {
            lastError = false;
            publish({
              nowMs: typeof next.nowMs === 'number' ? next.nowMs : Date.now(),
              peak: next.peak === true,
              multiplier: typeof next.multiplier === 'number' ? next.multiplier : 1,
            });
          } else {
            lastError = true;
          }
          emit();
        }, (err) => {
          inFlight = false;
          lastError = true;
          console.error('cost-estimator host call failed', err);
          emit();
        });
      };

      const subscribePeak = (fn) => {
        listeners.add(fn);
        subscribers += 1;
        if (stopPoll === null) stopPoll = ctx.interval(refresh, 60000);
        if (peakState === null || lastError) refresh();
        return () => {
          listeners.delete(fn);
          subscribers -= 1;
          if (subscribers <= 0 && stopPoll !== null) { stopPoll(); stopPoll = null; }
        };
      };

      const getPeakSnapshot = () => peakState;

      // ── Model probe (which rate row applies) ──────────────────────────────
      const modelKeys = new Map();
      const modelSubs = new Map();

      /**
       * Watch the session's shared model directory.
       * @param {string} sessionId - owning session.
       * @returns {object|null} stable model-key getter.
       */
      function modelProbe(sessionId) {
        const models = ctx.get('modelDirectories');
        if (models === undefined || sessionId === undefined || sessionId === null) return null;
        let directory;
        try { directory = models.directoryFor(sessionId); } catch (err) { return null; }
        if (directory === undefined || directory === null) return null;
        const store = directory.store;
        if (store === undefined || store === null) return null;

        const cached = modelSubs.get(sessionId);
        if (cached !== undefined) return cached;

        const probe = {
          read() {
            let snap;
            try { snap = store.getSnapshot(); } catch (err) { return ''; }
            const cur = snap === null || snap === undefined ? null : snap.current;
            if (cur === null || cur === undefined) return '';
            const provider = typeof cur.provider === 'string' ? cur.provider : '';
            const model = typeof cur.model === 'string' ? cur.model : '';
            return (provider + '|' + model).toLowerCase();
          },
          subscribe(fn) {
            const sync = () => {
              const next = probe.read();
              if (modelKeys.get(sessionId) !== next) {
                modelKeys.set(sessionId, next);
                fn();
              }
            };
            sync();
            const stop = store.subscribe(sync);
            return () => { try { stop(); } catch (err) { /* disposed */ } };
          },
          getKey() {
            const v = modelKeys.get(sessionId);
            return v === undefined ? '' : v;
          },
        };
        modelSubs.set(sessionId, probe);
        return probe;
      }

      const NOOP_SUBSCRIBE = () => () => {};
      const EMPTY_KEY = () => '';

      /**
       * The cost pill. Renders nothing until usage exists for a DeepSeek model.
       * @param {object} props - Slot standard props, including useProjection.
       * @returns {object|null} the pill, or null.
       */
      function CostPill(props) {
        const sessionId = props.sessionId;

        const probe = React.useMemo(() => modelProbe(sessionId), [sessionId]);
        const subscribeModel = probe === null ? NOOP_SUBSCRIBE : probe.subscribe;
        const getModelKey = probe === null ? EMPTY_KEY : probe.getKey;

        const modelKey = React.useSyncExternalStore(subscribeModel, getModelKey);
        const peakValue = React.useSyncExternalStore(subscribePeak, getPeakSnapshot);

        // The exact billing buckets the Harness already tracks. `undefined`
        // means the projection unit is not mounted or has not reported yet.
        const useProjection = props.useProjection;
        const usage = typeof useProjection === 'function'
          ? useProjection('tokenUsage')
          : undefined;

        if (typeof modelKey !== 'string' || modelKey.indexOf('deepseek') === -1) return null;

        // Nothing billed yet: stay invisible rather than showing $0.00.
        if (usage === undefined || usage === null) return null;
        const uncached = typeof usage.uncachedInputTokens === 'number' ? usage.uncachedInputTokens : 0;
        const cacheRead = typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0;
        const cacheWrite = typeof usage.cacheWriteTokens === 'number' ? usage.cacheWriteTokens : 0;
        const output = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0;
        const totalTokens = uncached + cacheRead + cacheWrite + output;
        if (totalTokens <= 0) return null;

        const model = modelKey.split('|')[1] || modelKey;
        const resolved = resolveRates(model);
        const mult = peakValue === null ? 1 : (peakValue.multiplier === OFF_PEAK_MULTIPLIER ? OFF_PEAK_MULTIPLIER : 1);
        const rates = resolved.row.peak;

        const costUncached = bucketCost(uncached, rates.uncachedInput) * mult;
        const costCacheRead = bucketCost(cacheRead, rates.cacheRead) * mult;
        const costCacheWrite = bucketCost(cacheWrite, rates.cacheWrite) * mult;
        const costOutput = bucketCost(output, rates.output) * mult;
        const totalCost = costUncached + costCacheRead + costCacheWrite + costOutput;

        const isPeak = peakValue !== null && peakValue.peak === true;
        const peakNote = isPeak ? 'peak rates (2x)' : 'off-peak rates (50% off)';
        const exactNote = resolved.exact
          ? ''
          : '\nUnknown model "' + model + '" — priced as DeepSeek Flash.';

        const details = [
          'Estimated session cost at published DeepSeek list rates.',
          '',
          'Model: ' + resolved.row.label + ' (' + peakNote + ')',
          'Cache read:   ' + formatTokens(cacheRead),
          'Cache write:  ' + formatTokens(cacheWrite),
          'Uncached in:  ' + formatTokens(uncached),
          'Output:       ' + formatTokens(output),
          '',
          'Total: ' + formatUsd(totalCost),
          '',
          'An estimate, not a bill. Credits, discounts, and retries',
          'billed on another route are not visible here.' + exactNote,
        ].join('\n');

        // The cache-hit rate is deliberately NOT repeated here: the usage pill
        // in this same row already reports it, so a second one would only give
        // two differently-worded numbers for the same measurement.
        //
        // Structure mirrors the shipped pills: label, a "·" separator, a value.
        return React.createElement('span', {
          className: 'dshCost' + (isPeak ? ' dshCostPeak' : ''),
          title: details,
          role: 'status',
        }, [
          React.createElement('span', { key: 'l', className: 'dshCostLabel' }, 'cost'),
          React.createElement('span', { key: 's', className: 'dshCostSep', 'aria-hidden': true }, '\u00b7'),
          React.createElement('span', { key: 'v' }, formatUsd(totalCost)),
        ]);
      }

      const slots = ctx.get('slots');
      if (slots === undefined) return;

      slots.inject('conversation.composer.dock', () => slots.register(
        { name: 'conversation.composer.dock', id: 'cost-estimator', order: 5 },
        (props) => React.createElement(CostPill, props),
      ));
    },
  };
}

// #endregion client

export { host, client };
