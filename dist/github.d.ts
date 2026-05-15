import type { PrSnapshot } from './types.js';
import type { GithubAnnouncementsConfig, GithubInboxConfig } from './config.js';
export interface FetchOptions {
    cwd: string;
    timeoutMs?: number;
    /** When provided, also fetch the user's review inbox into snapshot.inbox. */
    inboxConfig?: GithubInboxConfig;
    /** When provided, also fetch repo announcements into snapshot.announcements. */
    announcementsConfig?: GithubAnnouncementsConfig;
}
/**
 * Fetch a PR snapshot for the current branch in `cwd` by shelling out to `gh`.
 *
 * Never throws — always resolves to a PrSnapshot, with `error` set when we
 * can't produce a PR payload. Callers (refresher binary) serialize the
 * snapshot to disk; the HUD render path only reads from that file.
 */
export declare function fetchPrSnapshot(opts: FetchOptions): Promise<PrSnapshot>;
export declare function parseGitHubRemote(remote: string): PrSnapshot['repo'];
//# sourceMappingURL=github.d.ts.map