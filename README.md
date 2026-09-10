# dsh-peak-pricing-warning

Two [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugins about what your tokens actually cost:

- **`peak-pricing-warning`** — a live peak/off-peak pricing indicator with a countdown to the next rate change.
- **`cost-estimator`** — a running session cost estimate, priced from DeepSeek's real billing buckets.

DeepSeek bills off-peak requests at **half** the peak rate. Together these put *when* you are being billed and *how much* you have spent where you already look — so you can decide whether to send a large request now or wait.

```
🟡 Off-peak · peak in 8h 36m
🔴 Peak pricing · off-peak in 2h 30m
🟢 Off-peak weekend · peak in 1d 22h
```

The badge appears only when the session's selected model is a DeepSeek model. Switch to another provider and it disappears.

## Colour legend

| Badge | Meaning |
| --- | --- |
| 🔴 Red | Peak pricing — you pay full rate |
| 🟡 Yellow | Weekday off-peak — you pay half rate |
| 🟢 Green | Weekend — off-peak all day |

## The pricing rule

Peak hours are **01:00–04:00** and **06:00–10:00 UTC, Monday through Friday**. Every other hour is off-peak, which means weekends are always off-peak.

Source: [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing).

> **Note:** older documents and blog posts cite a single `16:30–00:30 UTC` off-peak window. DeepSeek has since split peak into the two weekday blocks above. This plugin follows the current published schedule, and unit-tests all five boundary shapes (both peak blocks, the gap between them, both weekend edges, and the post-weekend return).

## Install

```bash
dsh plugin add @imnotndesh/dsh-peak-pricing-warning
```

Restart the Host, then reload the web GUI.

### Install from a local checkout

```bash
git clone https://github.com/Imnotndesh/dsh-peak-pricing-warning.git
dsh plugin add ./dsh-peak-pricing-warning
```

### Try it without installing

Both plugins also run as **dynamic Cordis plugins**, no install required. Each is a self-contained file exporting two functions; pass them to `cordis_define` as `code.host` and `code.client`, then `cordis_run`:

- `plugins/peak-pricing-warning/src/plugin.js`
- `plugins/cost-estimator/src/plugin.js`

Useful for trying either out before committing to an install.

---

# cost-estimator

A running session cost estimate in the composer stats row, alongside the shipped time and usage pills:

```
turns 4 · 12.4k tok/s   ·   ⛁ 2.31M · 96% cached   ·   cost · $0.0795
```

It matches the styling of the pills beside it and reports only the one figure they do not: the dollar amount. The cache-hit rate is deliberately **not** repeated, since the usage pill in the same row already shows it.

Hover for the per-bucket token breakdown.

## Where the numbers come from

DeepSeek bills **four token classes at different rates**, and the Harness already tracks all four exactly. The `tokenUsage` session projection (owned by `@deepseek-ai/dsh-token-meter`) exposes them as disjoint cumulative buckets over the whole durable session log:

| Bucket | Meaning |
| --- | --- |
| `cacheReadTokens` | Input served from the KV cache — ~50x cheaper |
| `cacheWriteTokens` | Input written into the cache |
| `uncachedInputTokens` | Ordinary input tokens |
| `outputTokens` | Generated tokens (reasoning already included) |

So this plugin **does not count tokens**. It reads that projection and applies a rate table. That is also why the figure is exact at the bucket level: the counts come from provider-reported usage, not a heuristic.

> Do **not** confuse this with `ctx.tokenMeter.measure()`. `TokenMeasurement` is a context-*pressure* estimate for occupancy display, explicitly documented as not a billing input. The cost pill reads `tokenUsage`, the same projection the shipped usage donut renders.

## Rates

USD per 1M tokens, from [DeepSeek's published pricing](https://api-docs.deepseek.com/quick_start/pricing):

| Model | Cache read | Uncached input | Output |
| --- | --- | --- | --- |
| `deepseek-flash` | $0.006 | $0.30 | $1.20 |
| `deepseek-v4-pro` | $0.044 | $1.32 | $3.96 |

These are **peak** rates. Off-peak is derived as exactly half — that relationship is asserted in the tests, so a pricing change that breaks it fails loudly rather than silently doubling every figure.

Two deliberate simplifications, both documented in the source:

- **Cache writes are billed as uncached input.** DeepSeek publishes a cache *read* discount but no separate write premium, so a write is charged at the ordinary input rate. One field to change if that stops being true.
- **Unknown models fall back to Flash** and say so in the hover text rather than inventing a rate.

## What it is not

An estimate, not a bill. It prices the four buckets at list rates for the currently selected model. It **cannot** see: account credits or negotiated discounts, retries billed on a different route, or a mid-session model switch that leaves usage split across two price levels. The hover text states this rather than presenting the number as authoritative.

The Harness ships no rate table of its own, so this one is the plugin's, and it can lag a DeepSeek price change.

## How it works

Two halves, because the two facts come from different places.

**Host half** owns the clock. It computes the pricing window from the authoritative Host `Date`, resolves the exact next boundary, and answers one Package-private RPC method (`peak-status`). Only plain scalars cross that boundary. The key subtlety is *which* boundary to report: during off-peak the countdown must target the upcoming peak, whose start is found by scanning **backward** to the opening edge of the run in progress; during peak it scans **forward** to the next off-peak. Scanning the wrong direction collapses the countdown to `0m 00s` for the entire off-peak stretch.

**Client half** owns the pixels. It registers one badge into `conversation.input.left`, the composer tool row immediately beside the model selector, and ticks a local countdown every second. It re-polls the Host once a minute to correct drift and day rollovers.

**Model detection** reads the same shared per-session model directory the composer's own model selector uses (`ModelDirectoryResolver.directoryFor(sessionId).store`), so it tracks the real selection and reacts when you switch. Vendor names from other providers are checked first and rejected, so an aggregator route is never mistaken for a DeepSeek route.

### Two bugs worth documenting

Both are easy to reintroduce, so they are called out in the source.

1. **React error #185 (infinite render loop).** `useSyncExternalStore` compares snapshots *by reference*. Returning a freshly built object from `getSnapshot` — or mutating and returning a new object every tick — makes React re-render forever. The fix is one cached status object reused until a displayed field actually changes, and a primitive `"provider|model"` string rather than an object for the model key.

2. **A silent `catch` turned a crash into a hang.** A missing helper once made every Host call throw. The `catch` logged to the console and left the status `null`, so the badge sat on "Checking pricing…" indefinitely with no visible error and no retry. The poll is now refcounted and self-healing, always re-fetches on subscribe, and renders an explicit `Pricing status unavailable` instead of an endless placeholder.

## Verifying it

The pricing boundaries and rate table are the parts worth testing, since both are invisible until they are wrong. No Harness runtime needed:

```bash
node test/peak.test.mjs   # 8 schedule boundaries
node test/cost.test.mjs   # 12 published rates + invariants
```

`peak.test.mjs` covers every boundary shape — both peak blocks, the gap between them, both weekend edges, and the return to peak after a weekend — and asserts the countdown target is always in the future.

`cost.test.mjs` asserts the rate table reproduces every published DeepSeek figure exactly, that peak is exactly 2x off-peak, and that cache reads stay >10x cheaper than uncached input (the premise the "cached" percentage reports).

## Layout

```
plugins/peak-pricing-warning/src/plugin.js   peak/off-peak badge (both halves)
plugins/cost-estimator/src/plugin.js         session cost pill (both halves)
lib/                                         generated halves the dsh.bundle path loads
cordis.patch.yml                             composition row `dsh plugin add` applies
test/                                        boundary + rate tests
```

`lib/` is generated from the plugin sources by `node build.mjs`, so the dynamic-plugin copy and the installed package cannot drift.

## Compatibility

Built against DeepSeek Harness `0.1.5-rc.2`. Both plugins use one additive UI slot each (`conversation.input.left`, `conversation.composer.dock`), one Package-private RPC method, and no services of their own — neither replaces any shipped UI.

## License

MIT
