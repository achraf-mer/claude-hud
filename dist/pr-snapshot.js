import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { getHudPluginDir } from './claude-config-dir.js';
const VALID_REVIEW_STATES = new Set([
    'approved',
    'changes_requested',
    'commented',
    'pending',
]);
const VALID_SHIP_VERDICTS = new Set([
    'ready',
    'warning',
    'blocked',
    'unknown',
]);
const VALID_MERGEABLE = new Set([
    'mergeable',
    'conflicting',
    'unknown',
]);
const VALID_ERRORS = new Set([
    'gh-unauthed',
    'no-gh',
    'non-github',
    'no-pr',
    'fetch-failed',
    'no-remote',
]);
const VALID_SEVERITIES = new Set(['info', 'warning', 'critical']);
const VALID_ANN_SOURCES = new Set(['pinned-issue', 'labeled-issue']);
function parseInboxItem(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const obj = raw;
    const number = nonNegativeInt(obj.number);
    if (number <= 0)
        return null;
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
function parseAnnouncementItem(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const obj = raw;
    const number = nonNegativeInt(obj.number);
    if (number <= 0)
        return null;
    const severity = VALID_SEVERITIES.has(obj.severity)
        ? obj.severity
        : 'info';
    const source = VALID_ANN_SOURCES.has(obj.source)
        ? obj.source
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
function snapshotKeyForCwd(cwd) {
    return createHash('sha1').update(path.resolve(cwd)).digest('hex').slice(0, 16);
}
/**
 * Default location of the PR snapshot when `config.github.snapshotPath` is empty.
 * Mirrors where the refresher binary writes the file by default.
 */
export function getDefaultSnapshotPath(cwd, homeDir = os.homedir()) {
    return path.join(getHudPluginDir(homeDir), 'cache', `github-${snapshotKeyForCwd(cwd)}.json`);
}
function resolveSnapshotPath(config, cwd) {
    const configured = config.github.snapshotPath?.trim();
    if (configured) {
        return configured;
    }
    return getDefaultSnapshotPath(cwd);
}
function parseDate(value) {
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
function nonNegativeInt(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return 0;
    }
    return Math.floor(value);
}
function asString(value) {
    return typeof value === 'string' ? value : '';
}
function parseReviewer(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const obj = raw;
    const login = asString(obj.login).trim();
    if (!login) {
        return null;
    }
    const state = VALID_REVIEW_STATES.has(obj.state)
        ? obj.state
        : 'commented';
    const reviewer = { login, state };
    if (obj.isStale === true)
        reviewer.isStale = true;
    if (obj.isBot === true)
        reviewer.isBot = true;
    return reviewer;
}
function parseCi(raw) {
    if (!raw || typeof raw !== 'object') {
        return { success: 0, failure: 0, pending: 0, total: 0 };
    }
    const obj = raw;
    return {
        success: nonNegativeInt(obj.success),
        failure: nonNegativeInt(obj.failure),
        pending: nonNegativeInt(obj.pending),
        total: nonNegativeInt(obj.total),
    };
}
function parsePr(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const obj = raw;
    const number = nonNegativeInt(obj.number);
    if (number <= 0) {
        return null;
    }
    const reviewersRaw = Array.isArray(obj.reviewers) ? obj.reviewers : [];
    const reviewers = reviewersRaw
        .map(parseReviewer)
        .filter((r) => r !== null);
    const pendingRequestsRaw = Array.isArray(obj.pendingRequests) ? obj.pendingRequests : [];
    const pendingRequests = pendingRequestsRaw
        .map(asString)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    const mergeable = VALID_MERGEABLE.has(obj.mergeable)
        ? obj.mergeable
        : 'unknown';
    const shipVerdict = VALID_SHIP_VERDICTS.has(obj.shipVerdict)
        ? obj.shipVerdict
        : 'unknown';
    const pr = {
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
export function loadPrSnapshot(config, cwd, now = Date.now()) {
    if (!config.github.enabled) {
        return null;
    }
    if (!cwd) {
        return null;
    }
    const snapshotPath = resolveSnapshotPath(config, cwd);
    let raw;
    try {
        raw = fs.readFileSync(snapshotPath, 'utf8');
    }
    catch {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    const obj = parsed;
    const updatedAtDate = parseDate(obj.updatedAt);
    if (!updatedAtDate) {
        return null;
    }
    const maxAge = config.github.snapshotMaxAgeMs;
    if (maxAge > 0 && now - updatedAtDate.getTime() > maxAge) {
        return null;
    }
    let repo = null;
    if (obj.repo && typeof obj.repo === 'object') {
        const repoObj = obj.repo;
        const owner = asString(repoObj.owner).trim();
        const name = asString(repoObj.name).trim();
        if (owner && name) {
            repo = { owner, name };
        }
    }
    const branchValue = asString(obj.branch).trim();
    const branch = branchValue || null;
    const error = VALID_ERRORS.has(obj.error)
        ? obj.error
        : undefined;
    const snapshot = {
        updatedAt: updatedAtDate.toISOString(),
        repo,
        branch,
        pr: parsePr(obj.pr),
    };
    if (Array.isArray(obj.inbox)) {
        const inbox = obj.inbox.map(parseInboxItem).filter((i) => i !== null);
        if (inbox.length > 0)
            snapshot.inbox = inbox;
    }
    if (Array.isArray(obj.announcements)) {
        const announcements = obj.announcements
            .map(parseAnnouncementItem)
            .filter((a) => a !== null);
        if (announcements.length > 0)
            snapshot.announcements = announcements;
    }
    if (error) {
        snapshot.error = error;
    }
    return snapshot;
}
//# sourceMappingURL=pr-snapshot.js.map