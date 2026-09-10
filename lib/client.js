// GENERATED from plugins/peak-pricing-warning/src/plugin.js — do not edit.
// Client half: one badge in conversation.input.left, beside the model selector.
function client() {
  const CSS = [
    '.dshPeak{display:inline-flex;align-items:center;gap:6px;',
    'font:var(--dsw-font-xs-13,12px);line-height:16px;white-space:nowrap;',
    'border-radius:999px;padding:2px 8px;border:0.5px solid transparent;',
    'user-select:none;}',
    '.dshPeakDot{width:6px;height:6px;border-radius:999px;flex:none;',
    'background:currentColor;}',
    '.dshPeakCount{color:var(--dsw-alias-label-secondary);',
    'font-variant-numeric:tabular-nums;}',
    '.dshPeakOffline{border-color:var(--dsw-alias-border-l2);',
    'color:var(--dsw-alias-label-secondary);}',
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
          ? 'off-peak in ' + countdown(remaining)
          : 'peak in ' + countdown(remaining);

        const title = st.weekend
          ? 'DeepSeek weekend: all hours are off-peak'
          : (st.peak
            ? 'DeepSeek peak pricing (01:00-04:00, 06:00-10:00 UTC, Mon-Fri)'
            : 'DeepSeek off-peak pricing (peak resumes 01:00-04:00, 06:00-10:00 UTC, Mon-Fri)');

        return React.createElement('span', {
          className: 'dshPeak',
          style: { color: pal.color, background: pal.soft, borderColor: pal.color },
          title: title,
          role: 'status',
        }, [
          React.createElement('span', { key: 'dot', className: 'dshPeakDot' }),
          React.createElement('span', { key: 'label' }, pal.label),
          React.createElement('span', { key: 'sep', className: 'dshPeakCount' }, '\u00b7'),
          React.createElement('span', { key: 'p', className: 'dshPeakCount' }, primary),
        ]);
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

export { client };
export default client;
