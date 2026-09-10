// GENERATED from plugins/peak-pricing-warning/src/plugin.js — do not edit. Run `node build.mjs`.
// Client half: module-loader bundle. The __ModuleLoader__.load call is the
// handshake the browser module system requires; omitting it fails the whole
// combo request rather than merely this package.
window.__ModuleLoader__.load({
  id: "@imnotndesh/dsh-peak-pricing-warning",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    // styles.insert(css) over a package-owned <style> element.
    var styles = {
      insert: function (css) {
        var el = document.createElement("style");
        el.dataset.plugin = "@imnotndesh/dsh-peak-pricing-warning";
        el.textContent = css;
        document.head.appendChild(el);
        return function () {
          if (el.parentNode !== null) el.parentNode.removeChild(el);
        };
      },
    };

    // host.call(method, args) over this package's own webServer route.
    var HOST_ROUTE = "/dsh-peak-pricing-warning/api/";
    var host = {
      call: function (method, args) {
        return fetch(HOST_ROUTE + encodeURIComponent(method), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args === undefined ? null : args),
        }).then(function (response) {
          if (!response.ok) throw new Error("host call " + method + " failed: HTTP " + response.status);
          return response.json();
        });
      },
    };

function client() {
  // Plain inline text, not a pill: it sits in the composer tool row next to the
  // model selector, so it borrows that row's own typography and spacing instead
  // of drawing its own container. Only the status dot carries colour.
  const CSS = [
    '.dshPeak{display:inline-flex;align-items:center;gap:6px;',
    'font:var(--dsw-font-xs-13,12px);line-height:16px;white-space:nowrap;',
    'user-select:none;}',
    '.dshPeakDot{width:6px;height:6px;border-radius:999px;flex:none;',
    'background:currentColor;}',
    '.dshPeakLabel{font-weight:500;}',
    '.dshPeakMeta{color:var(--dsw-alias-label-secondary);',
    'font-variant-numeric:tabular-nums;}',
    '.dshPeakCost{color:var(--dsw-alias-label-secondary);',
    'font-variant-numeric:tabular-nums;}',
    '.dshPeakSep{color:var(--dsw-alias-label-caption);opacity:0.7;}',
    '.dshPeakOffline{color:var(--dsw-alias-label-secondary);}',
  ].join('');

  /**
   * Red on peak, yellow on a weekday off-peak, green all weekend.
   * @param {boolean} peak - whether peak pricing is active.
   * @param {boolean} weekend - whether it is a weekend.
   * @returns {{color: string, soft: string, label: string}} palette entry.
   */
  function paletteFor(peak, weekend) {
    if (weekend) {
      return { color: '#1f9d55', soft: 'rgba(31,157,85,0.12)', label: 'Off-peak weekend' };
    }
    if (peak) {
      return { color: '#e02b2b', soft: 'rgba(224,43,43,0.12)', label: 'Peak pricing' };
    }
    return { color: '#d9930a', soft: 'rgba(217,147,10,0.14)', label: 'Off-peak' };
  }

  /**
   * Compact duration: "2d 3h", "3h 07m", "07m 12s".
   * @param {number|null} ms - remaining milliseconds.
   * @returns {string} human-readable duration.
   */
  function countdown(ms) {
    if (ms === null || typeof ms !== 'number') return '--';
    let s = Math.max(0, Math.round(ms / 1000));
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    s -= m * 60;
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + pad(m) + 'm';
    return m + 'm ' + pad(s) + 's';
  }

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

  /**
   * Decide DeepSeek-ness from a flat "provider|model" key. Anything naming
   * another vendor is rejected first, so an aggregator route is never mistaken
   * for a DeepSeek route.
   * @param {string} key - lowercased "provider|model", or empty when unknown.
   * @returns {boolean} whether the current selection is a DeepSeek model.
   */
  function isDeepSeekKey(key) {
    if (typeof key !== 'string' || key.length === 0) return false;
    const others = ['anthropic', 'openai', 'claude', 'gpt', 'gemini', 'google',
      'mistral', 'qwen', 'llama', 'grok', 'xai'];
    for (let i = 0; i < others.length; i++) {
      if (key.indexOf(others[i]) !== -1) return false;
    }
    return key.indexOf('deepseek') !== -1;
  }

  return {
    inject: ['timer', 'slots'],
    apply(ctx) {
      ctx.effect(() => styles.insert(CSS), 'dsh-peak-pricing-warning');

      // ── Shared pricing clock ──────────────────────────────────────────────
      let status = null;
      let lastError = false;
      let subscribers = 0;
      let stopTick = null;
      let stopPoll = null;
      let inFlight = false;
      const listeners = new Set();

      const emit = () => {
        for (const fn of Array.from(listeners)) {
          try { fn(); } catch (err) { console.error('peak-pricing listener failed', err); }
        }
      };

      /**
       * Publish a status, reusing the previous reference when nothing changed.
       * @param {object} next - freshly built status fields.
       */
      const publish = (next) => {
        const prev = status;
        if (prev !== null
          && prev.peak === next.peak
          && prev.weekend === next.weekend
          && prev.peakStartMs === next.peakStartMs
          && prev.offPeakStartMs === next.offPeakStartMs) {
          // Carry the advanced clock onto the SAME object reference.
          prev.nowMs = next.nowMs;
          return;
        }
        status = next;
      };

      /**
       * Fetch the Host clock. Always clears the in-flight latch and always
       * emits, so a failed attempt is retried rather than parking the UI.
       */
      const refresh = () => {
        if (inFlight) return;
        inFlight = true;
        host.call('peak-status', {}).then((next) => {
          inFlight = false;
          if (next !== null && typeof next === 'object') {
            const num = (v) => (typeof v === 'number' ? v : null);
            lastError = false;
            publish({
              nowMs: typeof next.nowMs === 'number' ? next.nowMs : Date.now(),
              peak: next.peak === true,
              weekend: next.weekend === true,
              offPeakStartMs: num(next.offPeakStartMs),
              peakStartMs: num(next.peakStartMs),
            });
          } else {
            lastError = true;
          }
          emit();
        }, (err) => {
          inFlight = false;
          lastError = true;
          console.error('peak-pricing host call failed', err);
          emit();
        });
      };

      /** Start the shared intervals. Safe to call repeatedly. */
      const startTimers = () => {
        if (stopTick === null) {
          stopTick = ctx.interval(() => {
            if (status !== null) {
              status.nowMs = Date.now();
              emit();
            }
          }, 1000);
        }
        if (stopPoll === null) {
          stopPoll = ctx.interval(refresh, 60000);
        }
      };

      /** Stop both intervals once nobody is listening. */
      const stopTimers = () => {
        if (stopTick !== null) { stopTick(); stopTick = null; }
        if (stopPoll !== null) { stopPoll(); stopPoll = null; }
      };

      const subscribe = (fn) => {
        listeners.add(fn);
        subscribers += 1;
        startTimers();
        // Always fetch on subscribe: this recovers the badge after a first
        // attempt that raced the Host handler, or after any later failure.
        if (status === null || lastError) refresh();
        return () => {
          listeners.delete(fn);
          subscribers -= 1;
          if (subscribers <= 0) { subscribers = 0; stopTimers(); }
        };
      };

      // Stable getter: same reference until the state truly changes.
      const getSnapshot = () => status;

      // ── Per-session DeepSeek detection ────────────────────────────────────
      const modelKeys = new Map();
      const modelSubs = new Map();

      /**
       * Resolve the shared model directory for a session and watch it.
       * @param {string} sessionId - owning session.
       * @returns {object|null} a stable "provider|model" key getter.
       */
      function modelProbe(sessionId) {
        const models = ctx.get('modelDirectories');
        if (models === undefined || sessionId === undefined || sessionId === null) return null;
        let directory;
        try { directory = models.directoryFor(sessionId); } catch (err) { return null; }
        if (directory === undefined || directory === null) return null;
        const store = directory.store;
        if (store === undefined || store === null) return null;

        const existing = modelSubs.get(sessionId);
        if (existing !== undefined) return existing;

        const probe = {
          /** Read only the two scalar fields that decide DeepSeek-ness. */
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
            const cached = modelKeys.get(sessionId);
            return cached === undefined ? '' : cached;
          },
        };
        modelSubs.set(sessionId, probe);
        return probe;
      }

      const NOOP_SUBSCRIBE = () => () => {};
      const EMPTY_KEY = () => '';

      /**
       * The badge. Renders nothing unless the current model is DeepSeek.
       * @param {object} props - Slot standard props.
       * @returns {object|null} the badge element, or null to render nothing.
       */
      function PeakBadge(props) {
        const sessionId = props.sessionId;

        const probe = React.useMemo(() => modelProbe(sessionId), [sessionId]);
        const subscribeModel = probe === null ? NOOP_SUBSCRIBE : probe.subscribe;
        const getModelKey = probe === null ? EMPTY_KEY : probe.getKey;

        const modelKey = React.useSyncExternalStore(subscribeModel, getModelKey);
        const statusValue = React.useSyncExternalStore(subscribe, getSnapshot);

        // Hooks MUST run unconditionally, before any early return. Calling
        // useProjection after the guards below changes the hook count between
        // renders and trips React error #310 ("rendered more hooks than during
        // the previous render"), because the early returns skip it on some
        // renders and not others.
        const useProjection = props.useProjection;
        const usage = typeof useProjection === 'function'
          ? useProjection('tokenUsage')
          : undefined;

        if (!isDeepSeekKey(modelKey)) return null;
        if (statusValue === null) {
          const offline = lastError;
          return React.createElement('span', {
            className: 'dshPeak' + (offline ? ' dshPeakOffline' : ''),
            title: offline ? 'DeepSeek peak pricing: host clock unavailable' : undefined,
            role: 'status',
          }, offline ? 'Pricing status unavailable' : 'Checking pricing\u2026');
        }

        const st = statusValue;
        const pal = paletteFor(st.peak, st.weekend);

        // Exactly one countdown:
        //   peak     -> time until off-peak starts
        //   off-peak -> time until peak resumes
        const target = st.peak ? st.offPeakStartMs : st.peakStartMs;
        const remaining = target === null ? null : target - st.nowMs;
        const primary = st.peak
          ? 'Off-peak in ' + countdown(remaining)
          : 'Peak in ' + countdown(remaining);

        const title = st.weekend
          ? 'DeepSeek weekend: all hours are off-peak'
          : (st.peak
            ? 'DeepSeek peak pricing (01:00-04:00, 06:00-10:00 UTC, Mon-Fri)'
            : 'DeepSeek off-peak pricing (peak resumes 01:00-04:00, 06:00-10:00 UTC, Mon-Fri)');

        // ── Session cost ────────────────────────────────────────────────────
        // `usage` was read at the top of this component (a hook must not run
        // after an early return). Here we only price it: the four disjoint
        // buckets DeepSeek bills separately, which the shipped usage donut
        // renders from the same projection. Absent usage omits the figure.
        let costText = null;
        let costTitle = '';
        if (usage !== undefined && usage !== null) {
          const uncached = typeof usage.uncachedInputTokens === 'number' ? usage.uncachedInputTokens : 0;
          const cacheRead = typeof usage.cacheReadTokens === 'number' ? usage.cacheReadTokens : 0;
          const cacheWrite = typeof usage.cacheWriteTokens === 'number' ? usage.cacheWriteTokens : 0;
          const output = typeof usage.outputTokens === 'number' ? usage.outputTokens : 0;
          if (uncached + cacheRead + cacheWrite + output > 0) {
            const model = modelKey.split('|')[1] || modelKey;
            const resolved = resolveRates(model);
            const rates = resolved.row.peak;
            const mult = st.peak ? 1 : OFF_PEAK_MULTIPLIER;
            const usd = (
              bucketCost(uncached, rates.uncachedInput)
              + bucketCost(cacheRead, rates.cacheRead)
              + bucketCost(cacheWrite, rates.cacheWrite)
              + bucketCost(output, rates.output)
            ) * mult;
            costText = formatUsd(usd);
            costTitle = [
              'Estimated session cost at published DeepSeek list rates.',
              'Model: ' + resolved.row.label + ' (' + (st.peak ? 'peak' : 'off-peak') + ' rates)',
              'Cache read ' + formatTokens(cacheRead)
                + ' · write ' + formatTokens(cacheWrite)
                + ' · uncached ' + formatTokens(uncached)
                + ' · output ' + formatTokens(output),
              'An estimate, not a bill. Credits, discounts, and retries are not visible here.',
            ].join('\n');
          }
        }

        // Plain inline text: a coloured dot plus the status, then the countdown
        // and cost as secondary text. No pill, no border, no background.
        const children = [
          React.createElement('span', { key: 'dot', className: 'dshPeakDot' }),
          React.createElement('span', { key: 'label', className: 'dshPeakLabel' }, pal.label),
          React.createElement('span', { key: 'sep', className: 'dshPeakSep', 'aria-hidden': true }, '·'),
          React.createElement('span', { key: 'p', className: 'dshPeakMeta' }, primary),
        ];
        if (costText !== null) {
          children.push(React.createElement('span', {
            key: 'cs', className: 'dshPeakSep', 'aria-hidden': true,
          }, '·'));
          children.push(React.createElement('span', { key: 'c', className: 'dshPeakCost' }, costText));
        }

        return React.createElement('span', {
          className: 'dshPeak',
          style: { color: pal.color },
          title: costTitle === '' ? title : title + '\n\n' + costTitle,
          role: 'status',
        }, children);
      }

      const slots = ctx.get('slots');
      if (slots === undefined) return;

      slots.inject('conversation.input.left', () => slots.register(
        { name: 'conversation.input.left', id: 'peak-pricing' },
        (props) => React.createElement(PeakBadge, props),
      ));
    },
  };
}

    exports.apply = client;
    exports.default = client;
    return module.exports;
  },
});
