import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  AnnouncementItem,
  AnnouncementSeverity,
  CiCheckCounts,
  InboxItem,
  PrSnapshot,
  PrSnapshotError,
  PrStatus,
  ReviewState,
  ReviewerStatus,
  ShipVerdict,
} from './types.js';
import { isBot } from './format/reviewers.js';
import type { GithubAnnouncementsConfig, GithubInboxConfig } from './config.js';

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 10000;

export interface FetchOptions {
  cwd: string;
  timeoutMs?: number;
  /** When provided, also fetch the user's review inbox into snapshot.inbox. */
  inboxConfig?: GithubInboxConfig;
  /** When provided, also fetch repo announcements into snapshot.announcements. */
  announcementsConfig?: GithubAnnouncementsConfig;
}

interface GhPrView {
  number?: number;
  title?: string;
  url?: string;
  isDraft?: boolean;
  mergeable?: string;
  mergeStateStatus?: string;
  headRefName?: string;
  baseRefName?: string;
  reviews?: Array<{
    author?: { login?: string };
    state?: string;
    submittedAt?: string;
  }>;
  reviewRequests?: Array<{
    login?: string;
    slug?: string;
  }>;
  statusCheckRollup?: Array<{
    __typename?: string;
    name?: string;
    status?: string;
    conclusion?: string;
    state?: string;
    context?: string;
  }>;
  commits?: Array<{
    commit?: { committedDate?: string };
  }>;
}

/**
 * Fetch a PR snapshot for the current branch in `cwd` by shelling out to `gh`.
 *
 * Never throws — always resolves to a PrSnapshot, with `error` set when we
 * can't produce a PR payload. Callers (refresher binary) serialize the
 * snapshot to disk; the HUD render path only reads from that file.
 */
export async function fetchPrSnapshot(opts: FetchOptions): Promise<PrSnapshot> {
  const updatedAt = new Date().toISOString();
  const { cwd } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const remote = await getOriginUrl(cwd, timeoutMs);
  if (!remote) {
    return baseSnapshot(updatedAt, null, null, 'no-remote');
  }

  const repo = parseGitHubRemote(remote);
  if (!repo) {
    const branch = await getCurrentBranch(cwd, timeoutMs);
    return baseSnapshot(updatedAt, null, branch, 'non-github');
  }

  const branch = await getCurrentBranch(cwd, timeoutMs);

  if (!(await hasGhCli(timeoutMs))) {
    return baseSnapshot(updatedAt, repo, branch, 'no-gh');
  }

  if (!(await hasGhAuth(cwd, timeoutMs))) {
    return baseSnapshot(updatedAt, repo, branch, 'gh-unauthed');
  }

  // Inbox + announcements are fetched in parallel with PR view so the
  // total wall-time of the refresh is bounded by the slowest single call,
  // not the sum.
  const inboxPromise = opts.inboxConfig?.enabled
    ? fetchInbox(cwd, repo, opts.inboxConfig, timeoutMs).catch(() => [])
    : Promise.resolve<InboxItem[]>([]);
  const announcementsPromise = opts.announcementsConfig?.enabled
    ? fetchAnnouncements(cwd, repo, opts.announcementsConfig, timeoutMs).catch(() => [])
    : Promise.resolve<AnnouncementItem[]>([]);

  const buildResult = (snapshot: PrSnapshot): Promise<PrSnapshot> =>
    Promise.all([inboxPromise, announcementsPromise]).then(([inbox, announcements]) => {
      if (inbox.length > 0) snapshot.inbox = inbox;
      if (announcements.length > 0) snapshot.announcements = announcements;
      return snapshot;
    });

  if (!branch) {
    return buildResult(baseSnapshot(updatedAt, repo, null, 'no-pr'));
  }

  const view = await getPrViewForBranch(cwd, repo, branch, timeoutMs);
  if (view === null) {
    return buildResult(baseSnapshot(updatedAt, repo, branch, 'fetch-failed'));
  }
  if (view === 'no-pr') {
    return buildResult(baseSnapshot(updatedAt, repo, branch, 'no-pr'));
  }

  const pr = buildPrStatus(view);
  return buildResult({ updatedAt, repo, branch, pr });
}

function baseSnapshot(
  updatedAt: string,
  repo: PrSnapshot['repo'],
  branch: string | null,
  error: PrSnapshotError,
): PrSnapshot {
  return { updatedAt, repo, branch, pr: null, error };
}

async function getOriginUrl(cwd: string, timeoutMs: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf8',
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getCurrentBranch(cwd: string, timeoutMs: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf8',
    });
    const branch = stdout.trim();
    return branch && branch !== 'HEAD' ? branch : null;
  } catch {
    return null;
  }
}

const GITHUB_SSH_RE = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/(.+?)(?:\.git)?$/;
const GITHUB_HTTPS_RE = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/;

export function parseGitHubRemote(remote: string): PrSnapshot['repo'] {
  const sshMatch = remote.match(GITHUB_SSH_RE);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }
  const httpsMatch = remote.match(GITHUB_HTTPS_RE);
  if (httpsMatch) {
    return { owner: httpsMatch[1], name: httpsMatch[2] };
  }
  return null;
}

async function hasGhCli(timeoutMs: number): Promise<boolean> {
  try {
    await execFileAsync('gh', ['--version'], { timeout: timeoutMs, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

async function hasGhAuth(cwd: string, timeoutMs: number): Promise<boolean> {
  try {
    await execFileAsync('gh', ['auth', 'status'], {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

const PR_VIEW_FIELDS = [
  'number',
  'title',
  'url',
  'isDraft',
  'mergeable',
  'mergeStateStatus',
  'headRefName',
  'baseRefName',
  'reviews',
  'reviewRequests',
  'statusCheckRollup',
  'commits',
].join(',');

async function getPrViewForBranch(
  cwd: string,
  repo: NonNullable<PrSnapshot['repo']>,
  branch: string,
  timeoutMs: number,
): Promise<GhPrView | 'no-pr' | null> {
  // Use `gh pr list --head <branch> --repo <owner/name>` rather than `gh pr
  // view` so we don't depend on gh's default-repo detection (which can pick
  // upstream over origin when both remotes exist, missing same-repo PRs).
  // Take the first matching open PR if any.
  const repoSpec = `${repo.owner}/${repo.name}`;
  try {
    const { stdout: listStdout } = await execFileAsync(
      'gh',
      ['pr', 'list', '--repo', repoSpec, '--head', branch, '--state', 'open', '--limit', '1', '--json', 'number'],
      { cwd, timeout: timeoutMs, encoding: 'utf8' },
    );
    const list = JSON.parse(listStdout) as Array<{ number?: number }>;
    if (!Array.isArray(list) || list.length === 0 || typeof list[0].number !== 'number') {
      return 'no-pr';
    }
    const prNumber = list[0].number;

    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', String(prNumber), '--repo', repoSpec, '--json', PR_VIEW_FIELDS],
      { cwd, timeout: timeoutMs, encoding: 'utf8' },
    );
    const parsed = JSON.parse(stdout) as GhPrView;
    if (!parsed || typeof parsed.number !== 'number') {
      return 'no-pr';
    }
    return parsed;
  } catch (err) {
    const stderr = readErrorStderr(err);
    if (stderr && /no pull requests found/i.test(stderr)) {
      return 'no-pr';
    }
    return null;
  }
}

function readErrorStderr(err: unknown): string | null {
  if (err && typeof err === 'object' && 'stderr' in err) {
    const stderr = (err as { stderr?: unknown }).stderr;
    if (typeof stderr === 'string') return stderr;
  }
  return null;
}

function mapReviewState(raw: string | undefined): ReviewState {
  switch (raw) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes_requested';
    case 'PENDING':
      return 'pending';
    case 'COMMENTED':
    default:
      return 'commented';
  }
}

function buildReviewerList(view: GhPrView): {
  reviewers: ReviewerStatus[];
  pendingRequests: string[];
} {
  // gh returns the full review history; keep only the most recent per author.
  const latestByAuthor = new Map<string, { state: ReviewState; submittedAt: string }>();
  for (const review of view.reviews ?? []) {
    const login = review.author?.login?.trim();
    if (!login) continue;
    const state = mapReviewState(review.state);
    const submittedAt = review.submittedAt ?? '';
    const existing = latestByAuthor.get(login);
    if (!existing || submittedAt > existing.submittedAt) {
      latestByAuthor.set(login, { state, submittedAt });
    }
  }

  // Stale heuristic: review submitted before the most recent commit.
  const lastCommitAt = (view.commits ?? [])
    .map((c) => c.commit?.committedDate ?? '')
    .filter(Boolean)
    .sort()
    .pop() ?? '';

  const reviewers: ReviewerStatus[] = [];
  for (const [login, info] of latestByAuthor) {
    const reviewer: ReviewerStatus = { login, state: info.state };
    if (isBot(login)) {
      reviewer.isBot = true;
    }
    if (
      lastCommitAt &&
      info.submittedAt &&
      info.submittedAt < lastCommitAt &&
      (info.state === 'approved' || info.state === 'changes_requested' || info.state === 'commented')
    ) {
      reviewer.isStale = true;
    }
    reviewers.push(reviewer);
  }

  const pendingRequests: string[] = [];
  for (const request of view.reviewRequests ?? []) {
    const login = request.login?.trim();
    if (login) {
      pendingRequests.push(login);
      continue;
    }
    const slug = request.slug?.trim();
    if (slug) {
      pendingRequests.push(`@${slug}`);
    }
  }

  return { reviewers, pendingRequests };
}

function buildCiCounts(view: GhPrView): CiCheckCounts {
  const counts: CiCheckCounts = { success: 0, failure: 0, pending: 0, total: 0 };
  for (const check of view.statusCheckRollup ?? []) {
    counts.total += 1;
    if (check.__typename === 'CheckRun') {
      if (check.status && check.status !== 'COMPLETED') {
        counts.pending += 1;
        continue;
      }
      switch (check.conclusion) {
        case 'SUCCESS':
        case 'NEUTRAL':
        case 'SKIPPED':
          counts.success += 1;
          break;
        case 'FAILURE':
        case 'CANCELLED':
        case 'TIMED_OUT':
        case 'ACTION_REQUIRED':
        case 'STARTUP_FAILURE':
        case 'STALE':
          counts.failure += 1;
          break;
        default:
          counts.pending += 1;
      }
    } else {
      // StatusContext
      switch (check.state) {
        case 'SUCCESS':
          counts.success += 1;
          break;
        case 'FAILURE':
        case 'ERROR':
          counts.failure += 1;
          break;
        case 'PENDING':
        default:
          counts.pending += 1;
      }
    }
  }
  return counts;
}

function computeShipVerdict(view: GhPrView, reviewers: ReviewerStatus[], ci: CiCheckCounts): {
  verdict: ShipVerdict;
  reason?: string;
} {
  if (view.isDraft) {
    return { verdict: 'blocked', reason: 'draft' };
  }
  if (view.mergeable === 'CONFLICTING') {
    return { verdict: 'blocked', reason: 'merge conflicts' };
  }
  if (ci.failure > 0) {
    return { verdict: 'blocked', reason: `${ci.failure} failing check${ci.failure === 1 ? '' : 's'}` };
  }
  const changesRequested = reviewers.some((r) => r.state === 'changes_requested' && !r.isStale);
  if (changesRequested) {
    return { verdict: 'blocked', reason: 'changes requested' };
  }
  if (ci.pending > 0) {
    return { verdict: 'warning', reason: `${ci.pending} pending check${ci.pending === 1 ? '' : 's'}` };
  }
  const hasApproval = reviewers.some((r) => r.state === 'approved' && !r.isStale);
  if (!hasApproval) {
    return { verdict: 'warning', reason: 'awaiting review' };
  }
  return { verdict: 'ready' };
}

interface GhInboxRow {
  number?: number;
  title?: string;
  url?: string;
  updatedAt?: string;
  author?: { login?: string };
  repository?: { name?: string; nameWithOwner?: string };
}

/**
 * Fetch PRs awaiting the authenticated user's review. Scope determines
 * whether we limit to the current repo (default) or include every repo.
 */
async function fetchInbox(
  cwd: string,
  repo: NonNullable<PrSnapshot['repo']>,
  config: GithubInboxConfig,
  timeoutMs: number,
): Promise<InboxItem[]> {
  const args = [
    'search',
    'prs',
    '--review-requested=@me',
    '--state=open',
    '--limit',
    '20',
    '--json',
    'number,title,url,updatedAt,author,repository',
  ];
  if (config.scope === 'current-repo') {
    args.push('--repo', `${repo.owner}/${repo.name}`);
  }
  try {
    const { stdout } = await execFileAsync(
      'gh',
      args,
      { cwd, timeout: timeoutMs, encoding: 'utf8' },
    );
    const rows = JSON.parse(stdout) as GhInboxRow[];
    if (!Array.isArray(rows)) return [];
    const items: InboxItem[] = [];
    for (const row of rows) {
      if (typeof row.number !== 'number') continue;
      const author = row.author?.login?.trim() ?? '';
      const nameWithOwner = row.repository?.nameWithOwner ?? '';
      const [owner = '', name = row.repository?.name ?? ''] = nameWithOwner.split('/');
      items.push({
        number: row.number,
        title: row.title ?? '',
        url: row.url ?? '',
        author,
        repoOwner: owner,
        repoName: name,
        updatedAt: row.updatedAt ?? '',
      });
    }
    return items;
  } catch {
    return [];
  }
}

const ANNOUNCEMENT_GRAPHQL = `
query($owner: String!, $name: String!, $label: String!, $maxItems: Int!) {
  repository(owner: $owner, name: $name) {
    pinnedIssues(first: 3) {
      nodes {
        issue {
          number
          title
          url
          updatedAt
          state
          labels(first: 10) { nodes { name } }
        }
      }
    }
    issues(states: OPEN, labels: [$label], first: $maxItems, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number
        title
        url
        updatedAt
        labels(first: 10) { nodes { name } }
      }
    }
  }
}
`;

interface GhIssueNode {
  number?: number;
  title?: string;
  url?: string;
  updatedAt?: string;
  state?: string;
  labels?: { nodes?: Array<{ name?: string }> };
}

interface GhAnnouncementsResponse {
  data?: {
    repository?: {
      pinnedIssues?: { nodes?: Array<{ issue?: GhIssueNode }> };
      issues?: { nodes?: GhIssueNode[] };
    };
  };
}

/**
 * Fetch active announcements for the current repo. Combines pinned
 * issues + issues with the configured label in one GraphQL call, then
 * dedupes and classifies severity from `severity:*` labels.
 */
async function fetchAnnouncements(
  cwd: string,
  repo: NonNullable<PrSnapshot['repo']>,
  config: GithubAnnouncementsConfig,
  timeoutMs: number,
): Promise<AnnouncementItem[]> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      [
        'api',
        'graphql',
        '-f', `query=${ANNOUNCEMENT_GRAPHQL}`,
        '-F', `owner=${repo.owner}`,
        '-F', `name=${repo.name}`,
        '-F', `label=${config.label}`,
        '-F', `maxItems=${Math.max(1, config.maxItems)}`,
      ],
      { cwd, timeout: timeoutMs, encoding: 'utf8' },
    );
    const response = JSON.parse(stdout) as GhAnnouncementsResponse;
    const repository = response.data?.repository;
    if (!repository) return [];

    const pinnedNodes = (repository.pinnedIssues?.nodes ?? [])
      .map((n) => n.issue)
      .filter((i): i is GhIssueNode => i !== undefined && i !== null);
    const labeledNodes = repository.issues?.nodes ?? [];

    const items: AnnouncementItem[] = [];
    const seen = new Set<number>();

    const addNode = (node: GhIssueNode, source: AnnouncementItem['source']) => {
      if (typeof node.number !== 'number') return;
      if (seen.has(node.number)) return;
      // Only include open issues — pinnedIssues nodes can include closed ones.
      if (node.state && node.state !== 'OPEN') return;
      seen.add(node.number);
      items.push({
        number: node.number,
        title: node.title ?? '',
        url: node.url ?? '',
        severity: extractSeverity(node.labels?.nodes ?? []),
        source,
        updatedAt: node.updatedAt ?? '',
      });
    };

    // Pinned first (typically more important); labeled fills in remaining slots.
    if (config.includePinned) {
      for (const node of pinnedNodes) addNode(node, 'pinned-issue');
    }
    for (const node of labeledNodes) addNode(node, 'labeled-issue');

    // Sort by severity (critical → warning → info), then by recency.
    const severityRank: Record<AnnouncementSeverity, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => {
      const s = severityRank[a.severity] - severityRank[b.severity];
      if (s !== 0) return s;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });

    return items.slice(0, Math.max(1, config.maxItems));
  } catch {
    return [];
  }
}

function extractSeverity(labels: Array<{ name?: string }>): AnnouncementSeverity {
  for (const label of labels) {
    const name = label.name?.toLowerCase().trim() ?? '';
    if (name === 'severity:critical' || name === 'critical') return 'critical';
    if (name === 'severity:warning' || name === 'warning') return 'warning';
    if (name === 'severity:info' || name === 'info') return 'info';
  }
  return 'info';
}

function buildPrStatus(view: GhPrView): PrStatus {
  const { reviewers, pendingRequests } = buildReviewerList(view);
  const ci = buildCiCounts(view);
  const { verdict, reason } = computeShipVerdict(view, reviewers, ci);

  const mergeable = view.mergeable === 'MERGEABLE'
    ? 'mergeable'
    : view.mergeable === 'CONFLICTING'
      ? 'conflicting'
      : 'unknown';

  const pr: PrStatus = {
    number: view.number ?? 0,
    title: view.title ?? '',
    url: view.url ?? '',
    headBranch: view.headRefName ?? '',
    baseBranch: view.baseRefName ?? '',
    draft: view.isDraft === true,
    mergeable,
    reviewers,
    pendingRequests,
    ci,
    shipVerdict: verdict,
  };
  if (reason) {
    pr.shipReason = reason;
  }
  return pr;
}
