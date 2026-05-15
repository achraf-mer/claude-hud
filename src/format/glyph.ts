import type { GlyphSpacingMode } from '../config.js';

/**
 * Pad a status glyph (✓ ✗ ◐ ↑ ↓ ⚠ ↻ etc.) against adjacent content based on
 * the HUD-wide `display.glyphSpacing` setting.
 *
 *   tight  → "✓alice"      (no space; relies on color)
 *   normal → "✓ alice"     (single space; default)
 *   loose  → "✓  alice"    (double space; max breathing room)
 *
 * The helper is used wherever a glyph butts against text so spacing stays
 * consistent across renderers without each one re-implementing the rule.
 */
export function glyphPair(glyph: string, content: string, spacing: GlyphSpacingMode): string {
  switch (spacing) {
    case 'tight':
      return `${glyph}${content}`;
    case 'loose':
      return `${glyph}  ${content}`;
    case 'normal':
    default:
      return `${glyph} ${content}`;
  }
}

/**
 * Join multiple `glyphPair` outputs with a separator sized to the spacing
 * mode. Inter-group separators are one cell wider than the intra-pair
 * spacing so groups visually separate without needing extra punctuation.
 *
 *   tight  → single space    "✓12 ✗1 ◐3"
 *   normal → double space    "✓ 12  ✗ 1  ◐ 3"
 *   loose  → triple space    "✓  12   ✗  1   ◐  3"
 */
export function joinGlyphPairs(parts: string[], spacing: GlyphSpacingMode): string {
  let separator = ' ';
  if (spacing === 'normal') separator = '  ';
  else if (spacing === 'loose') separator = '   ';
  return parts.join(separator);
}
