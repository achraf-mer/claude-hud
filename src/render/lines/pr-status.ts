import type { RenderContext } from '../../types.js';
import type { CiCheckCounts, PrStatus, ShipVerdict } from '../../types.js';
import { critical, dim, green, label, project as projectColor, warning } from '../colors.js';
import { formatReviewers } from '../../format/reviewers.js';
import { glyphPair, joinGlyphPairs } from '../../format/glyph.js';

const SHIP_GLYPH: Record<ShipVerdict, string> = {
  ready: '✓',
  warning: '⚠',
  blocked: '✗',
  unknown: '◐',
};

function colorShip(verdict: ShipVerdict, glyph: string, colors: RenderContext['config']['colors']): string {
  switch (verdict) {
    case 'ready':
      return green(glyph);
    case 'warning':
      return warning(glyph, colors);
    case 'blocked':
      return critical(glyph, colors);
    case 'unknown':
    default:
      return dim(glyph);
  }
}

function formatCiCounts(ci: CiCheckCounts, spacing: RenderContext['config']['display']['glyphSpacing'], colors: RenderContext['config']['colors']): string | null {
  if (ci.total === 0) {
    return null;
  }
  const parts: string[] = [];
  if (ci.success > 0) parts.push(glyphPair(green('✓'), String(ci.success), spacing));
  if (ci.failure > 0) parts.push(glyphPair(critical('✗', colors), String(ci.failure), spacing));
  if (ci.pending > 0) parts.push(glyphPair(dim('◐'), String(ci.pending), spacing));
  if (parts.length === 0) return null;
  return joinGlyphPairs(parts, spacing);
}

function formatErrorHint(error: string, colors: RenderContext['config']['colors']): string | null {
  switch (error) {
    case 'gh-unauthed':
      return label('PR: ', colors) + warning('gh auth login required', colors);
    case 'no-gh':
      return label('PR: ', colors) + dim('install gh CLI for PR status');
    case 'non-github':
    case 'no-remote':
    case 'no-pr':
      return null;
    case 'fetch-failed':
      return label('PR: ', colors) + dim('fetch failed');
    default:
      return null;
  }
}

function truncateTitle(title: string, maxLen: number): string {
  if (!title) return '';
  if (title.length <= maxLen) return title;
  return `${title.slice(0, Math.max(1, maxLen - 1))}…`;
}

function buildPrLine(pr: PrStatus, ctx: RenderContext): string {
  const display = ctx.config.display;
  const colors = ctx.config.colors;
  const spacing = display.glyphSpacing;

  const segments: string[] = [];

  const prRef = `PR #${pr.number}`;
  const prTitle = truncateTitle(pr.title, 60);
  const draftSuffix = pr.draft ? dim(' (draft)') : '';
  const header = prTitle
    ? `${projectColor(prRef, colors)} ${prTitle}${draftSuffix}`
    : `${projectColor(prRef, colors)}${draftSuffix}`;
  segments.push(header);

  const ciText = formatCiCounts(pr.ci, spacing, colors);
  if (ciText) {
    segments.push(`${label('CI', colors)} ${ciText}`);
  }

  const reviewsText = formatReviewers({
    reviewers: pr.reviewers,
    pendingRequests: pr.pendingRequests,
    config: ctx.config.github.reviews,
    spacing,
  });
  if (reviewsText) {
    segments.push(`${label('Reviews:', colors)} ${reviewsText}`);
  }

  const shipGlyph = colorShip(pr.shipVerdict, SHIP_GLYPH[pr.shipVerdict], colors);
  const shipLabel = label('Ship:', colors);
  const reasonSuffix = pr.shipReason && pr.shipVerdict !== 'ready'
    ? dim(` (${pr.shipReason})`)
    : '';
  segments.push(`${shipLabel} ${shipGlyph}${reasonSuffix}`);

  return segments.join(' │ ');
}

export function renderPrStatusLine(ctx: RenderContext): string | null {
  if (!ctx.config?.github?.enabled) {
    return null;
  }

  const snapshot = ctx.prSnapshot;
  if (!snapshot) {
    return null;
  }

  if (snapshot.error && !snapshot.pr) {
    return formatErrorHint(snapshot.error, ctx.config.colors);
  }

  if (!snapshot.pr) {
    return null;
  }

  return buildPrLine(snapshot.pr, ctx);
}
