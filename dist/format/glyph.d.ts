import type { GlyphSpacingMode } from '../config.js';
/**
 * Pad a status glyph against adjacent content based on the HUD-wide
 * `display.glyphSpacing` setting. Wide glyphs (emoji) get one extra
 * space in every mode to compensate for their built-in right padding.
 *
 *   tight  + narrow → "✓alice"     | tight  + wide → "💬 alice"
 *   normal + narrow → "✓ alice"    | normal + wide → "💬  alice"
 *   loose  + narrow → "✓  alice"   | loose  + wide → "💬   alice"
 */
export declare function glyphPair(glyph: string, content: string, spacing: GlyphSpacingMode): string;
/**
 * Join multiple `glyphPair` outputs with a separator sized to the spacing
 * mode. Inter-group separators are one cell wider than the intra-pair
 * spacing so groups visually separate without needing extra punctuation.
 *
 *   tight  → single space    "✓12 ✗1 ◐3"
 *   normal → double space    "✓ 12  ✗ 1  ◐ 3"
 *   loose  → triple space    "✓  12   ✗  1   ◐  3"
 */
export declare function joinGlyphPairs(parts: string[], spacing: GlyphSpacingMode): string;
//# sourceMappingURL=glyph.d.ts.map