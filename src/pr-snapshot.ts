import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';
import type { HudConfig } from './config.js';
import type {
  AnnouncementItem,
  AnnouncementSeverity,
  AnnouncementSource,
  CiCheckCounts,
  InboxItem,
  PrSnapshot,
  PrSnapshotError,
  PrStatus,
  ReviewState,
  ReviewerStatus,
  ShipVerdict,
} from './types.js';

const VALID_REVIEW_STATES = new Set<ReviewState>([
  'approved',
  'changes_requested',
  'commented',
  'pending',
]);

const VALID_SHIP_VERDICTS = new Set<ShipVerdict>([
  'ready',
  'warning',
  'blocked',
  'unknown',
]);

const VALID_MERGEABLE = new Set<PrStatus['mergeable']>([
  'mergeable',
  'conflicting',
  'unknown',
]);

const VALID_ERRORS = new Set<PrSnapshotError>([
  'gh-unauthed',
  'no-gh',
  'non-github',
  'no-pr',
  'fetch-failed',
  'no-remote',
]);

const VALID_SEVERITIES = new Set<AnnouncementSeverity>(['info', 'warning', 'critical']);
const VALID_ANN_SOURCES = new Set<AnnouncementSource>(['pinned-issue', 'labeled-issue']);

function parseInboxItem(raw: unknown): InboxItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const number = nonNegativeInt(obj.number);
  if (number <= 0) return null;
  return {
    number,
    title: asString(obj.title),
    url: asString(obj.url),
    author: asString(obj.author),
    repoOwner: asString(obj.repoOwner),
    repoName: asString(obj.repoName),
    updatedAt: asString(obj.updatedAt),
  };
}

function parseAnnouncementItem(raw: unknown): AnnouncementItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const number = nonNegativeInt(obj.number);
  if (number <= 0) return null;
  const severity = VALID_SEVERITIES.has(obj.severity as AnnouncementSeverity)
    ? (obj.severity as AnnouncementSeverity)
    : 'info';
  const source = VALID_ANN_SOURCES.has(obj.source as AnnouncementSource)
    ? (obj.source as AnnouncementSource)
    : 'labeled-issue';
  return {
    number,
    title: asString(obj.title),
    url: asString(obj.url),
    severity,
    source,
    updatedAt: asString(obj.updatedAt),
  };
}

/**
 * Per-cwd snapshot path. Two Claude Code sessions in different working
 * directories must NOT share a snapshot file — otherwise each session's
 * Stop hook overwrites the other's data. The cwd hash gives us a stable
 * per-directory key without needing to shell out to git from the render
 * path.
 */
function snapshotKeyForCwd(cwd: string): string {
  return createHash('sha1').update(path.resolve(cwd)).digest('hex').slice(0, 16);
}

/**
 * Default location of the PR snapshot when `config.github.snapshotPath` is empty.
 * Mirrors where the refresher binary writes the file by default.
 */
export function getDefaultSnapshotPath(cwd: string, homeDir: string = os.homedir()): string {
  return path.join(getHudPluginDir(homeDir), 'cache', `github-${snapshotKeyForCwd(cwd)}.json`);
}

function resolveSnapshotPath(config: HudConfig, cwd: string): string {
  const configured = config.github.snapshotPath?.trim();
  if (configured) {
    return configured;
  }
  return getDefaultSnapshotPath(cwd);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseReviewer(raw: unknown): ReviewerStatus | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const login = asString(obj.login).trim();
  if (!login) {
    return null;
  }
  const state = VALID_REVIEW_STATES.has(obj.state as ReviewState)
    ? (obj.state as ReviewState)
    : 'commented';
  const reviewer: ReviewerStatus = { login, state };
  if (obj.isStale === true) reviewer.isStale = true;
  if (obj.isBot === true) reviewer.isBot = true;
  return reviewer;
}

function parseCi(raw: unknown): CiCheckCounts {
  if (!raw || typeof raw !== 'object') {
    return { success: 0, failure: 0, pending: 0, total: 0 };
  }
  const obj = raw as Record<string, unknown>;
  return {
    success: nonNegativeInt(obj.success),
    failure: nonNegativeInt(obj.failure),
    pending: nonNegativeInt(obj.pending),
    total: nonNegativeInt(obj.total),
  };
}

function parsePr(raw: unknown): PrStatus | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const number = nonNegativeInt(obj.number);
  if (number <= 0) {
    return null;
  }

  const reviewersRaw = Array.isArray(obj.reviewers) ? obj.reviewers : [];
  const reviewers = reviewersRaw
    .map(parseReviewer)
    .filter((r): r is ReviewerStatus => r !== null);

  const pendingRequestsRaw = Array.isArray(obj.pendingRequests) ? obj.pendingRequests : [];
  const pendingRequests = pendingRequestsRaw
    .map(asString)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const mergeable = VALID_MERGEABLE.has(obj.mergeable as PrStatus['mergeable'])
    ? (obj.mergeable as PrStatus['mergeable'])
    : 'unknown';

  const shipVerdict = VALID_SHIP_VERDICTS.has(obj.shipVerdict as ShipVerdict)
    ? (obj.shipVerdict as ShipVerdict)
    : 'unknown';

  const pr: PrStatus = {
    number,
    title: asString(obj.title),
    url: asString(obj.url),
    headBranch: asString(obj.headBranch),
    baseBranch: asString(obj.baseBranch),
    draft: obj.draft === true,
    mergeable,
    reviewers,
    pendingRequests,
    ci: parseCi(obj.ci),
    shipVerdict,
  };
  const shipReason = asString(obj.shipReason).trim();
  if (shipReason) {
    pr.shipReason = shipReason;
  }
  return pr;
}

/**
 * Load and validate the PR snapshot written by the refresher binary.
 *
 * Returns null when:
 *   - the snapshot file is missing or unreadable
 *   - the JSON is malformed
 *   - the snapshot is older than `config.github.snapshotMaxAgeMs`
 *
 * Returns a snapshot with `error` set when the refresher recorded a
 * surfaced error (e.g. gh not authed). Renderers decide whether to
 * show a hint or hide entirely.
 *
 * The snapshot path is derived from `cwd` so that two Claude Code
 * sessions in different working directories don't overwrite each
 * other's data via the shared Stop hook.
 */
export function loadPrSnapshot(
  config: HudConfig,
  cwd: string | undefined,
  now: number = Date.now(),
): PrSnapshot | null {
  if (!config.github.enabled) {
    return null;
  }
  if (!cwd) {
    return null;
  }

  const snapshotPath = resolveSnapshotPath(config, cwd);

  let raw: string;
  try {
    raw = fs.readFileSync(snapshotPath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  const updatedAtDate = parseDate(obj.updatedAt);
  if (!updatedAtDate) {
    return null;
  }

  const maxAge = config.github.snapshotMaxAgeMs;
  if (maxAge > 0 && now - updatedAtDate.getTime() > maxAge) {
    return null;
  }

  let repo: PrSnapshot['repo'] = null;
  if (obj.repo && typeof obj.repo === 'object') {
    const repoObj = obj.repo as Record<string, unknown>;
    const owner = asString(repoObj.owner).trim();
    const name = asString(repoObj.name).trim();
    if (owner && name) {
      repo = { owner, name };
    }
  }

  const branchValue = asString(obj.branch).trim();
  const branch = branchValue || null;
  const error = VALID_ERRORS.has(obj.error as PrSnapshotError)
    ? (obj.error as PrSnapshotError)
    : undefined;

  const snapshot: PrSnapshot = {
    updatedAt: updatedAtDate.toISOString(),
    repo,
    branch,
    pr: parsePr(obj.pr),
  };

  if (Array.isArray(obj.inbox)) {
    const inbox = obj.inbox.map(parseInboxItem).filter((i): i is InboxItem => i !== null);
    if (inbox.length > 0) snapshot.inbox = inbox;
  }
  if (Array.isArray(obj.announcements)) {
    const announcements = obj.announcements
      .map(parseAnnouncementItem)
      .filter((a): a is AnnouncementItem => a !== null);
    if (announcements.length > 0) snapshot.announcements = announcements;
  }
  if (error) {
    snapshot.error = error;
  }
  return snapshot;
}
