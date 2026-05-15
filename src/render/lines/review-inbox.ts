import type { RenderContext, InboxItem } from '../../types.js';
import { label, project as projectColor, dim } from '../colors.js';

/**
 * "Inbox: alice #4231, bob #4128 (+2 more)" — PRs awaiting your review.
 * Hides entirely when there are no items, so a quiet inbox costs zero
 * statusline real estate.
 */
export function renderReviewInboxLine(ctx: RenderContext): string | null {
  if (!ctx.config?.github?.enabled) return null;
  const inboxConfig = ctx.config.github.inbox;
  if (!inboxConfig?.enabled) return null;

  const snapshot = ctx.prSnapshot;
  const items = snapshot?.inbox;
  if (!items || items.length === 0) return null;

  const colors = ctx.config.colors;
  const max = Math.max(1, inboxConfig.maxItems);

  if (!inboxConfig.showAuthors) {
    const noun = items.length === 1 ? 'PR' : 'PRs';
    return `${label('Inbox:', colors)} ${items.length} ${noun} awaiting your review`;
  }

  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  const rendered = visible.map(formatInboxItem(colors));
  const head = rendered.join(', ');
  const tail = overflow > 0 ? dim(` +${overflow} more`) : '';
  return `${label('Inbox:', colors)} ${head}${tail}`;
}

function formatInboxItem(colors: RenderContext['config']['colors']) {
  return (item: InboxItem) => `${item.author} ${projectColor(`#${item.number}`, colors)}`;
}
