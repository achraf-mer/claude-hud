#!/usr/bin/env node
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { loadConfig } from '../config.js';
import { fetchPrSnapshot } from '../github.js';
import { getDefaultSnapshotPath } from '../pr-snapshot.js';
/**
 * Refresher binary, invoked by Claude Code's Stop hook after each turn.
 *
 * Detects the current working directory (from the hook stdin payload or
 * process.cwd()), calls `fetchPrSnapshot`, and writes the result to the
 * configured snapshot path. Designed to be a fire-and-forget side process —
 * any error is swallowed silently so a transient gh/git problem never
 * interrupts the user's session.
 */
async function main() {
    const cwd = await detectCwd();
    if (!cwd) {
        return;
    }
    const config = await loadConfig(cwd);
    if (!config.github.enabled) {
        return;
    }
    let snapshot;
    try {
        snapshot = await fetchPrSnapshot({
            cwd,
            inboxConfig: config.github.inbox,
            announcementsConfig: config.github.announcements,
        });
    }
    catch {
        return;
    }
    const snapshotPath = config.github.snapshotPath?.trim() || getDefaultSnapshotPath(cwd, os.homedir());
    try {
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
    }
    catch {
        // Snapshot write failed — nothing useful to surface. The HUD will fall
        // back to whatever older snapshot exists, or hide the PR line entirely.
    }
}
async function detectCwd() {
    const fromStdin = await tryReadHookStdin();
    if (fromStdin) {
        return fromStdin;
    }
    try {
        return process.cwd();
    }
    catch {
        return null;
    }
}
async function tryReadHookStdin() {
    if (process.stdin.isTTY) {
        return null;
    }
    try {
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
            // Cap stdin read at 1 MB to avoid hanging on a misconfigured hook.
            if (chunks.reduce((n, c) => n + c.length, 0) > 1_000_000)
                break;
        }
        if (chunks.length === 0) {
            return null;
        }
        const text = Buffer.concat(chunks).toString('utf8').trim();
        if (!text)
            return null;
        const parsed = JSON.parse(text);
        const fromCwd = typeof parsed.cwd === 'string' ? parsed.cwd.trim() : '';
        if (fromCwd)
            return fromCwd;
        const workspaceCwd = parsed.workspace && typeof parsed.workspace === 'object'
            ? parsed.workspace.current_dir
            : undefined;
        if (typeof workspaceCwd === 'string' && workspaceCwd.trim()) {
            return workspaceCwd.trim();
        }
        return null;
    }
    catch {
        return null;
    }
}
const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a, b) => {
    try {
        return realpathSync(a) === realpathSync(b);
    }
    catch {
        return a === b;
    }
};
if (argvPath && isSamePath(argvPath, scriptPath)) {
    void main();
}
//# sourceMappingURL=refresh-github.js.map