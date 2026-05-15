const WIDE_GLYPH_PATTERN = /\p{Extended_Pictographic}/u;
/**
 * True when the glyph is rendered double-width in most terminal fonts —
 * primarily emoji (💬, 🚨, etc.). These glyphs already carry visible
 * right-side padding, so a single space against adjacent text looks
 * cramped compared to narrow glyphs like ✓ ◐ ↑. We add one extra space
 * to wide glyphs to balance the visual gap.
 */
function isWideGlyph(glyph) {
    return WIDE_GLYPH_PATTERN.test(glyph);
}
/**
 * Pad a status glyph against adjacent content based on the HUD-wide
 * `display.glyphSpacing` setting. Wide glyphs (emoji) get one extra
 * space in every mode to compensate for their built-in right padding.
 *
 *   tight  + narrow → "✓alice"     | tight  + wide → "💬 alice"
 *   normal + narrow → "✓ alice"    | normal + wide → "💬  alice"
 *   loose  + narrow → "✓  alice"   | loose  + wide → "💬   alice"
 */
export function glyphPair(glyph, content, spacing) {
    const wide = isWideGlyph(glyph);
    switch (spacing) {
        case 'tight':
            return wide ? `${glyph} ${content}` : `${glyph}${content}`;
        case 'loose':
            return wide ? `${glyph}   ${content}` : `${glyph}  ${content}`;
        case 'normal':
        default:
            return wide ? `${glyph}  ${content}` : `${glyph} ${content}`;
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
export function joinGlyphPairs(parts, spacing) {
    let separator = ' ';
    if (spacing === 'normal')
        separator = '  ';
    else if (spacing === 'loose')
        separator = '   ';
    return parts.join(separator);
}
//# sourceMappingURL=glyph.js.map