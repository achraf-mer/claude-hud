import type { GithubReviewsConfig, GlyphSpacingMode } from '../config.js';
import type { ReviewerStatus } from '../types.js';
/** Detect bot accounts by GitHub's `[bot]` suffix convention or a known-bot list. */
export declare function isBot(login: string): boolean;
/**
 * Map a review state (plus optional stale flag) to its display glyph.
 *
 *   approved          → ✓
 *   changes_requested → ⚠
 *   pending           → ◐   (review requested but not submitted)
 *   commented         → 💬  (commented without approve/reject)
 *   <stale variant>   → ↻
 */
export declare function reviewGlyph(reviewer: ReviewerStatus, showStale: boolean): string;
export interface FormatReviewersInput {
    reviewers: ReviewerStatus[];
    pendingRequests: string[];
    config: GithubReviewsConfig;
    spacing: GlyphSpacingMode;
}
/**
 * Format a reviewer list for display. Combines submitted reviews with
 * still-pending review requests (rendered as ◐ <login>), applies the
 * configured style, and caps to `maxNames` with `+N` overflow.
 *
 * Returns null when there's nothing useful to show (no reviewers and
 * no pending requests).
 */
export declare function formatReviewers(input: FormatReviewersInput): string | null;
//# sourceMappingURL=reviewers.d.ts.map