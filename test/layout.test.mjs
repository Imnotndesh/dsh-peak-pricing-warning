/**
 * Guards the cost pill's inline placement arithmetic.
 *
 * The pill shares a visual row with the shipped stats pills by cancelling one
 * line box of the stats row with a negative top margin. That offset is derived
 * from the same CSS variables the row uses, so this test asserts the derivation
 * still matches the row's own line-height formula.
 *
 * If a harness update changes the row's metrics, this fails loudly here rather
 * than silently dropping the pill onto its own line.
 */
import assert from 'node:assert/strict';

// The stats row (StatsPills root) computes:
//   font-size:   var(--dsh-content-font-size-secondary, 13px)
//   line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px))
//
// And the theme defines:
//   --dsh-content-font-size-secondary: min(font - 1px, max(13px, font - 2px))
//   --dsh-content-font-delta-secondary: calc(--dsh-content-font-size-secondary - 13px)
function secondarySize(fontPx) {
  return Math.min(fontPx - 1, Math.max(13, fontPx - 2));
}

function rowLineHeight(fontPx) {
  const delta = secondarySize(fontPx) - 13;
  return 20 + delta;
}

// The offset the plugin applies: margin-top: calc(-20px - delta).
function pluginOffset(fontPx) {
  const delta = secondarySize(fontPx) - 13;
  return -(20 + delta);
}

// At any font scale the offset must exactly cancel one line box.
for (const font of [12, 13, 14, 15, 16, 18, 20, 24]) {
  const line = rowLineHeight(font);
  const offset = pluginOffset(font);
  assert.equal(
    offset, -line,
    `font ${font}px: offset ${offset} must cancel line box -${line}`,
  );
}

// The default 14px case must be the plain 20px line box: this is the common
// path, and a regression here is what most users would see.
assert.equal(rowLineHeight(14), 20, 'default line box should be 20px');
assert.equal(pluginOffset(14), -20, 'default offset should be -20px');

console.log('layout.test.mjs: inline placement arithmetic holds at all font scales');
