import type { HudConfig } from './config.js';
import type { PrSnapshot } from './types.js';
/**
 * Default location of the PR snapshot when `config.github.snapshotPath` is empty.
 * Mirrors where the refresher binary writes the file by default.
 */
export declare function getDefaultSnapshotPath(cwd: string, homeDir?: string): string;
/**
 * Persist a PrSnapshot to the per-cwd snapshot file used by `loadPrSnapshot`.
 * Used by the render path's inline-refresh-on-mismatch logic to keep the
 * shared snapshot in sync with what was just fetched, so subsequent renders
 * (and the Stop / SessionStart hooks) see the same fresh data.
 *
 * Failures are swallowed silently: the worst case is that the next render
 * has to refresh again. We never want a snapshot-write error to break the
 * HUD output.
 */
export declare function writeSnapshot(config: HudConfig, cwd: string, snapshot: PrSnapshot): void;
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
export declare function loadPrSnapshot(config: HudConfig, cwd: string | undefined, now?: number): PrSnapshot | null;
//# sourceMappingURL=pr-snapshot.d.ts.map