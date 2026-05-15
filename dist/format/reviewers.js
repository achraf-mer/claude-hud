import { glyphPair, joinGlyphPairs } from './glyph.js';
const BOT_SUFFIX = '[bot]';
const KNOWN_BOTS = new Set([
    'dependabot',
    'renovate',
    'mergify',
    'github-actions',
    'codecov',
    'sonarcloud',
    'snyk-bot',
    'claude',
    'allcontributors',
]);
/** Detect bot accounts by GitHub's `[bot]` suffix convention or a known-bot list. */
export function isBot(login) {
    if (!login)
        return false;
    const lower = login.toLowerCase();
    if (lower.endsWith(BOT_SUFFIX))
        return true;
    return KNOWN_BOTS.has(lower);
}
/**
 * Map a review state (plus optional stale flag) to its display glyph.
 *
 *   approved          → ✓
 *   changes_requested → ⚠
 *   pending           → ◐   (review requested but not submitted)
 *   commented         → 💬  (commented without approve/reject)
 *   <stale variant>   → ↻
 */
export function reviewGlyph(reviewer, showStale) {
    if (showStale && reviewer.isStale) {
        return '↻';
    }
    switch (reviewer.state) {
        case 'approved':
            return '✓';
        case 'changes_requested':
            return '⚠';
        case 'pending':
            return '◐';
        case 'commented':
        default:
            return '💬';
    }
}
function countByState(reviewers, showStale) {
    const counts = { approved: 0, changesRequested: 0, pending: 0, commented: 0, stale: 0 };
    for (const reviewer of reviewers) {
        if (showStale && reviewer.isStale) {
            counts.stale += 1;
            continue;
        }
        switch (reviewer.state) {
            case 'approved':
                counts.approved += 1;
                break;
            case 'changes_requested':
                counts.changesRequested += 1;
                break;
            case 'pending':
                counts.pending += 1;
                break;
            case 'commented':
                counts.commented += 1;
                break;
        }
    }
    return counts;
}
/**
 * Format a reviewer list for display. Combines submitted reviews with
 * still-pending review requests (rendered as ◐ <login>), applies the
 * configured style, and caps to `maxNames` with `+N` overflow.
 *
 * Returns null when there's nothing useful to show (no reviewers and
 * no pending requests).
 */
export function formatReviewers(input) {
    const { config, spacing } = input;
    // Merge submitted reviews + pending review requests. Requests dedupe
    // against any login that has already submitted a review.
    const submittedLogins = new Set(input.reviewers.map((r) => r.login.toLowerCase()));
    const pendingFromRequests = input.pendingRequests
        .filter((login) => !submittedLogins.has(login.toLowerCase()))
        .map((login) => ({ login, state: 'pending', isBot: isBot(login) }));
    let combined = [...input.reviewers, ...pendingFromRequests];
    if (config.filterBots) {
        combined = combined.filter((r) => !(r.isBot ?? isBot(r.login)));
    }
    if (combined.length === 0) {
        return null;
    }
    const useNames = config.style === 'names' ||
        (config.style === 'auto' && combined.length <= config.maxNames);
    if (!useNames) {
        return formatAsCounts(combined, config.showStale, spacing);
    }
    return formatAsNames(combined, config, spacing);
}
function formatAsCounts(reviewers, showStale, spacing) {
    const counts = countByState(reviewers, showStale);
    const parts = [];
    if (counts.approved > 0)
        parts.push(glyphPair('✓', String(counts.approved), spacing));
    if (counts.changesRequested > 0)
        parts.push(glyphPair('⚠', String(counts.changesRequested), spacing));
    if (counts.pending > 0)
        parts.push(glyphPair('◐', String(counts.pending), spacing));
    if (counts.commented > 0)
        parts.push(glyphPair('💬', String(counts.commented), spacing));
    if (counts.stale > 0)
        parts.push(glyphPair('↻', String(counts.stale), spacing));
    return joinGlyphPairs(parts, spacing);
}
function formatAsNames(reviewers, config, spacing) {
    const visible = reviewers.slice(0, config.maxNames);
    const overflow = reviewers.length - visible.length;
    const parts = visible.map((r) => glyphPair(reviewGlyph(r, config.showStale), r.login, spacing));
    if (overflow > 0) {
        parts.push(`+${overflow}`);
    }
    return joinGlyphPairs(parts, spacing);
}
//# sourceMappingURL=reviewers.js.map