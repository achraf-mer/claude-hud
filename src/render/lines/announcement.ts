import type { AnnouncementItem, RenderContext } from '../../types.js';
import { critical, dim, label, project as projectColor, warning } from '../colors.js';
import { glyphPair } from '../../format/glyph.js';

const SEVERITY_GLYPH: Record<AnnouncementItem['severity'], string> = {
  info: '📢',
  warning: '⚠',
  critical: '🚨',
};

/**
 * Banner line(s) for active announcements. Hides entirely when there
 * are no items, so a "quiet" repo costs zero statusline real estate.
 * Renders at the top of the HUD by virtue of its position in
 * DEFAULT_ELEMENT_ORDER. Multiple items stack on separate lines so
 * each has full readable width.
 */
export function renderAnnouncementLine(ctx: RenderContext): string | null {
  if (!ctx.config?.github?.enabled) return null;
  const annConfig = ctx.config.github.announcements;
  if (!annConfig?.enabled) return null;

  const snapshot = ctx.prSnapshot;
  const items = snapshot?.announcements;
  if (!items || items.length === 0) return null;

  const colors = ctx.config.colors;
  const spacing = ctx.config.display.glyphSpacing;
  const max = Math.max(1, annConfig.maxItems);
  const visible = items.slice(0, max);

  // Each announcement on its own line so titles aren't truncated below
  // legibility. Newlines flow through render()'s line-flattening step.
  return visible.map((item) => renderOne(item, spacing, colors)).join('\n');
}

function renderOne(
  item: AnnouncementItem,
  spacing: RenderContext['config']['display']['glyphSpacing'],
  colors: RenderContext['config']['colors'],
): string {
  const glyph = SEVERITY_GLYPH[item.severity];
  const title = truncate(item.title, 80);
  const ref = projectColor(`#${item.number}`, colors);
  const body = `${title} ${dim('—')} ${ref}`;
  const colored = colorize(item.severity, glyphPair(glyph, body, spacing), colors);
  return colored;
}

function colorize(
  severity: AnnouncementItem['severity'],
  text: string,
  colors: RenderContext['config']['colors'],
): string {
  switch (severity) {
    case 'critical':
      return critical(text, colors);
    case 'warning':
      return warning(text, colors);
    case 'info':
    default:
      return label(text, colors);
  }
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`;
}
