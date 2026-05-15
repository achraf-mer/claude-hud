import type { HudConfig } from './config.js';
import type { PrSnapshot } from './types.js';
/**
 * Default location of the PR snapshot when `config.github.snapshotPath` is empty.
 * Mirrors where the refresher binary writes the file by default.
 */
export declare function getDefaultSnapshotPath(cwd: string, homeDir?: string): string;
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