# dsh-peak-pricing-warning

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that shows, right beside the model selector, **whether DeepSeek is on peak or off-peak pricing, how long until that changes, and what the session has cost so far.**

```
● Off-peak · peak in 8h 36m · $0.0795
● Peak pricing · off-peak in 2h 30m · $0.1240
● Off-peak weekend · peak in 1d 22h · $0.0310
```

DeepSeek bills off-peak requests at **half** the peak rate, so the two facts belong together: *when* you are being billed, and *how much* you have spent. Plain inline text — no pill, no border, no background — so it reads as part of the composer row rather than as a widget bolted onto it.

It appears only when the session's selected model is a DeepSeek model. Switch provider and it disappears.

| Dot | Meaning |
| --- | --- |
| 🔴 Red | Peak pricing — full rate |
| 🟡 Yellow | Weekday off-peak — half rate |
| 🟢 Green | Weekend — off-peak all day |

Hover for the rate class, the per-bucket token split, and the cost caveats.

## The pricing rule

Peak hours are **01:00–04:00** and **06:00–10:00 UTC, Monday through Friday**. Every other hour is off-peak, which makes weekends off-peak all day.

Source: [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing).

> **Note:** older documents and blog posts cite a single `16:30–00:30 UTC` off-peak window. DeepSeek has since split peak into the two weekday blocks above. This plugin follows the current published schedule, and tests all five boundary shapes — both peak blocks, the gap between them, both weekend edges, and the return to peak after a weekend.

## Cost

The cost figure is priced from the `tokenUsage` session projection, which already exposes DeepSeek's **four disjoint billing buckets** over the whole durable session log:

| Bucket | Rate vs. uncached input |
| --- | --- |
| `cacheReadTokens` | ~50x cheaper — the reason to keep a cache warm |
| `cacheWriteTokens` | billed as ordinary input |
| `uncachedInputTokens` | full input rate |
| `outputTokens` | full output rate (reasoning already included) |

Because those counts are provider-reported, the plugin **does not count tokens** — it only applies a rate table. The same projection backs the shipped usage donut.

> Not to be confused with `ctx.tokenMeter.measure()`. `TokenMeasurement` is a context-*pressure* estimate for occupancy display, documented as not a billing input. This plugin reads `tokenUsage`.

### Rates

USD per 1M tokens, from [DeepSeek's published pricing](https://api-docs.deepseek.com/quick_start/pricing):

| Model | Cache read | Uncached input | Output |
| --- | --- | --- | --- |
| `deepseek-flash` | $0.006 | $0.30 | $1.20 |
| `deepseek-v4-pro` | $0.044 | $1.32 | $3.96 |

These are **peak** rates; off-peak is derived as exactly half. The tests assert that relationship, so a pricing change that breaks it fails loudly instead of silently doubling every figure. Two documented simplifications:

- **Cache writes are billed as uncached input** — DeepSeek publishes a cache *read* discount but no separate write premium. One field to change if that stops being true.
- **Unknown models fall back to Flash** and say so in the hover text rather than inventing a rate.

### What it is not

An estimate, not a bill. It prices four buckets at list rates for the currently selected model, and **cannot** see account credits or negotiated discounts, retries billed on another route, or a mid-session model switch that leaves usage split across two price levels. The hover text says so rather than presenting the number as authoritative. The Harness ships no rate table of its own, so this one is the plugin's and can lag a price change.

## Install

```bash
dsh plugin add @imnotndesh/dsh-peak-pricing-warning
```

Restart the Host, then reload the web GUI.

### From a local checkout

```bash
git clone https://github.com/Imnotndesh/dsh-peak-pricing-warning.git
dsh plugin add ./dsh-peak-pricing-warning
```

### Without installing

The plugin also runs as a **dynamic Cordis plugin**. `plugins/peak-pricing-warning/src/plugin.js` exports two functions; pass them to `cordis_define` as `code.host` and `code.client`, then `cordis_run`.

## How it works

**Host half** owns the clock. It computes the pricing window from the authoritative Host `Date` and answers one Package-private RPC method (`peak-status`), returning only scalars. The subtlety is *which* boundary to report: during off-peak the countdown targets the upcoming peak, whose start is found by scanning **backward** to the opening edge of the run in progress; during peak it scans **forward**. Scanning the wrong way collapses the countdown to `0m 00s` for the entire off-peak stretch.

**Client half** owns the pixels, reads the model selection and the usage projection, and ticks a local countdown every second, re-polling the Host once a minute for drift and day rollovers.

### Three bugs worth documenting

All are easy to reintroduce, so each is called out in the source.

1. **React #185 — infinite render loop.** `useSyncExternalStore` compares snapshots *by reference*. Returning a freshly built object from `getSnapshot`, or mutating and returning a new object each tick, re-renders forever. Fixed with one cached status object reused until a displayed field changes, and a primitive `"provider|model"` string instead of an object.

2. **React #310 — "rendered more hooks than during the previous render".** `useProjection` was called *after* two early `return null` guards. A hook after a conditional return runs on some renders and not others, so the hook count changed. **Every hook must run unconditionally before any return.** This is the one to watch when adding to this component.

3. **A silent `catch` turned a crash into a hang.** A missing helper once made every Host call throw; the `catch` logged to console and left the status `null`, so the badge sat on "Checking pricing…" forever with no error and no retry. The poll is now refcounted and self-healing, re-fetches on subscribe, and renders an explicit `Pricing status unavailable` instead of an endless placeholder.

## Verifying it

```bash
node test/peak.test.mjs   # 8 schedule boundaries
node test/cost.test.mjs   # 12 published rates + invariants
```

No Harness runtime needed. `peak.test.mjs` covers every boundary shape and asserts the countdown target is always in the future. `cost.test.mjs` asserts the rate table reproduces every published DeepSeek figure exactly, that peak is exactly 2x off-peak, and that cache reads stay >10x cheaper than uncached input — the premise the cost figure depends on.

## Layout

```
plugins/peak-pricing-warning/src/plugin.js   single source of truth (both halves)
lib/                                          generated halves the dsh.bundle path loads
cordis.patch.yml                             composition row `dsh plugin add` applies
test/                                        boundary + rate tests
```

`lib/` is generated from the plugin source by `node build.mjs`, so the dynamic-plugin copy and the installed package cannot drift.

## Compatibility

Built against DeepSeek Harness `0.1.5-rc.2`. Uses one additive UI slot (`conversation.input.left`), one Package-private RPC method, and no services of its own — it replaces no shipped UI.

## License

MIT
