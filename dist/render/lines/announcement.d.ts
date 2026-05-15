import type { RenderContext } from '../../types.js';
/**
 * Banner line(s) for active announcements. Hides entirely when there
 * are no items, so a "quiet" repo costs zero statusline real estate.
 * Renders at the top of the HUD by virtue of its position in
 * DEFAULT_ELEMENT_ORDER. Multiple items stack on separate lines so
 * each has full readable width.
 */
export declare function renderAnnouncementLine(ctx: RenderContext): string | null;
//# sourceMappingURL=announcement.d.ts.map