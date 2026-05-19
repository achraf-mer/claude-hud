import { readStdin, getUsageFromStdin } from "./stdin.js";
import { parseTranscript } from "./transcript.js";
import { render } from "./render/index.js";
import { countConfigs } from "./config-reader.js";
import { getGitStatus } from "./git.js";
import { loadConfig } from "./config.js";
import { parseExtraCmdArg, runExtraCmd } from "./extra-cmd.js";
import { getClaudeCodeVersion } from "./version.js";
import { getMemoryUsage } from "./memory.js";
import { resolveEffortLevel } from "./effort.js";
import { applyContextWindowFallback } from "./context-cache.js";
import { getUsageFromExternalSnapshot } from "./external-usage.js";
import { loadPrSnapshot, writeSnapshot } from "./pr-snapshot.js";
import { fetchPrSnapshot } from "./github.js";
import { setLanguage, t } from "./i18n/index.js";
import type { GitStatus } from "./git.js";
import type { HudConfig } from "./config.js";
import type { PrSnapshot, RenderContext } from "./types.js";

export { getUsageFromExternalSnapshot } from "./external-usage.js";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

export type MainDeps = {
  readStdin: typeof readStdin;
  getUsageFromStdin: typeof getUsageFromStdin;
  getUsageFromExternalSnapshot: typeof getUsageFromExternalSnapshot;
  parseTranscript: typeof parseTranscript;
  countConfigs: typeof countConfigs;
  getGitStatus: typeof getGitStatus;
  loadConfig: typeof loadConfig;
  parseExtraCmdArg: typeof parseExtraCmdArg;
  runExtraCmd: typeof runExtraCmd;
  getClaudeCodeVersion: typeof getClaudeCodeVersion;
  getMemoryUsage: typeof getMemoryUsage;
  applyContextWindowFallback: typeof applyContextWindowFallback;
  render: typeof render;
  now: () => number;
  log: (...args: unknown[]) => void;
};

export async function main(overrides: Partial<MainDeps> = {}): Promise<void> {
  const deps: MainDeps = {
    readStdin,
    getUsageFromStdin,
    getUsageFromExternalSnapshot,
    parseTranscript,
    countConfigs,
    getGitStatus,
    loadConfig,
    parseExtraCmdArg,
    runExtraCmd,
    getClaudeCodeVersion,
    getMemoryUsage,
    applyContextWindowFallback,
    render,
    now: () => Date.now(),
    log: console.log,
    ...overrides,
  };

  try {
    const stdin = await deps.readStdin();

    if (!stdin) {
      // Running without stdin - this happens during setup verification
      const config = await deps.loadConfig();
      setLanguage(config.language);
      const isMacOS = process.platform === "darwin";
      deps.log(t("init.initializing"));
      if (isMacOS) {
        deps.log(t("init.macosNote"));
      }
      return;
    }

    const transcriptPath = stdin.transcript_path ?? "";
    const transcript = await deps.parseTranscript(transcriptPath);

    deps.applyContextWindowFallback(stdin, {}, transcript.sessionName, {
      lastCompactBoundaryAt: transcript.lastCompactBoundaryAt,
      lastCompactPostTokens: transcript.lastCompactPostTokens,
    });

    const { claudeMdCount, rulesCount, mcpCount, hooksCount, outputStyle } =
      await deps.countConfigs(stdin.cwd);

    const config = await deps.loadConfig(stdin.cwd);
    setLanguage(config.language);
    const gitStatus = config.gitStatus.enabled
      ? await deps.getGitStatus(stdin.cwd)
      : null;

    let usageData: RenderContext["usageData"] = null;
    if (config.display.showUsage !== false) {
      usageData = deps.getUsageFromStdin(stdin);
      if (!usageData) {
        usageData = deps.getUsageFromExternalSnapshot(config, deps.now());
      }
    }

    const extraCmd = deps.parseExtraCmdArg();
    const extraLabel = extraCmd ? await deps.runExtraCmd(extraCmd) : null;

    const sessionDuration = formatSessionDuration(
      transcript.sessionStart,
      deps.now,
    );
    const claudeCodeVersion = config.display.showClaudeCodeVersion
      ? await deps.getClaudeCodeVersion()
      : undefined;
    const effortInfo = config.display.showEffortLevel
      ? resolveEffortLevel(stdin.effort)
      : null;
    const memoryUsage =
      config.display.showMemoryUsage && config.lineLayout === "expanded"
        ? await deps.getMemoryUsage()
        : null;

    const prSnapshot = config.github.enabled
      ? await ensureFreshPrSnapshot(config, stdin.cwd, gitStatus, deps.now())
      : null;

    const ctx: RenderContext = {
      stdin,
      transcript,
      claudeMdCount,
      rulesCount,
      mcpCount,
      hooksCount,
      sessionDuration,
      gitStatus,
      usageData,
      memoryUsage,
      config,
      extraLabel,
      outputStyle,
      claudeCodeVersion,
      effortLevel: effortInfo?.level,
      effortSymbol: effortInfo?.symbol,
      prSnapshot,
    };

    deps.render(ctx);
  } catch (error) {
    deps.log(
      "[claude-hud] Error:",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}

/**
 * Hard timeout for the inline refresh. If `gh` is slow or unresponsive,
 * the statusline must still produce output within a bounded delay so the
 * HUD doesn't appear frozen. Three seconds is generous enough for a
 * single `gh pr list` + `gh pr view` round-trip but won't make Claude
 * Code's UI feel stuck.
 */
const INLINE_REFRESH_TIMEOUT_MS = 3000;

/**
 * Return the freshest possible PrSnapshot for the current branch.
 *
 * Reads the cached snapshot first. If the snapshot's branch doesn't
 * match the current git branch (or no snapshot exists at all), spawns
 * the refresher inline — bounded by `INLINE_REFRESH_TIMEOUT_MS` — and
 * returns the fresh result. Falls back to the cached (possibly stale)
 * snapshot on timeout or fetch failure so the HUD never silently
 * disappears.
 *
 * This is an event-driven freshness guarantee: the check runs on every
 * statusline invocation Claude Code makes (assistant message, /compact,
 * permission change, vim toggle). It does NOT add new triggers and does
 * NOT poll on a timer. When the cached snapshot already matches reality
 * (the common case), the check is ~5ms (a single string compare and a
 * stat-equivalent operation) so the render path stays fast.
 */
async function ensureFreshPrSnapshot(
  config: HudConfig,
  cwd: string | undefined,
  gitStatus: GitStatus | null,
  now: number,
): Promise<PrSnapshot | null> {
  const cached = loadPrSnapshot(config, cwd, now);

  if (!config.github?.enabled || !cwd) {
    return cached;
  }

  const currentBranch = gitStatus?.branch ?? null;
  if (!currentBranch) {
    // No current branch (detached HEAD or non-git cwd) — nothing to compare.
    return cached;
  }

  const branchMatches = cached?.branch === currentBranch;
  if (branchMatches) {
    return cached;
  }

  // Stale or missing snapshot for this branch. Refresh inline with a hard
  // timeout so a slow gh call can't freeze the HUD.
  try {
    const fetched = await Promise.race<PrSnapshot | null>([
      fetchPrSnapshot({
        cwd,
        inboxConfig: config.github.inbox,
        announcementsConfig: config.github.announcements,
      }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), INLINE_REFRESH_TIMEOUT_MS),
      ),
    ]);

    if (fetched) {
      writeSnapshot(config, cwd, fetched);
      return fetched;
    }
  } catch {
    // Fall through — render whatever cached state we had.
  }

  return cached;
}

export function formatSessionDuration(
  sessionStart?: Date,
  now: () => number = () => Date.now(),
): string {
  if (!sessionStart) {
    return "";
  }

  const ms = now() - sessionStart.getTime();
  const mins = Math.floor(ms / 60000);

  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a: string, b: string): boolean => {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return a === b;
  }
};
if (argvPath && isSamePath(argvPath, scriptPath)) {
  void main();
}
