import type { Language } from './i18n/types.js';
export type LineLayoutType = 'compact' | 'expanded';
export type AutocompactBufferMode = 'enabled' | 'disabled';
export type ContextValueMode = 'percent' | 'tokens' | 'remaining' | 'both';
export type UsageValueMode = 'percent' | 'remaining';
export type GitBranchOverflowMode = 'truncate' | 'wrap';
/**
 * Controls how the model name is displayed in the HUD badge.
 *
 *   full:    Show the raw display name as-is (e.g. "Opus 4.6 (1M context)")
 *   compact: Strip redundant context-window suffix (e.g. "Opus 4.6")
 *   short:   Strip context suffix AND "Claude " prefix (e.g. "Opus 4.6")
 */
export type ModelFormatMode = 'full' | 'compact' | 'short';
export type TimeFormatMode = 'relative' | 'absolute' | 'both';
export type GlyphSpacingMode = 'tight' | 'normal' | 'loose';
export type ReviewerStyleMode = 'auto' | 'names' | 'counts';
export type HudElement = 'project' | 'addedDirs' | 'context' | 'usage' | 'promptCache' | 'memory' | 'environment' | 'tools' | 'agents' | 'todos' | 'sessionTime' | 'prStatus' | 'reviewInbox' | 'announcement';
export type AddedDirsLayout = 'inline' | 'line';
export type HudColorName = 'dim' | 'red' | 'green' | 'yellow' | 'magenta' | 'cyan' | 'brightBlue' | 'brightMagenta';
/** A color value: named preset, 256-color index (0-255), or hex string (#rrggbb). */
export type HudColorValue = HudColorName | number | string;
export interface HudColorOverrides {
    context: HudColorValue;
    usage: HudColorValue;
    warning: HudColorValue;
    usageWarning: HudColorValue;
    critical: HudColorValue;
    model: HudColorValue;
    project: HudColorValue;
    git: HudColorValue;
    gitBranch: HudColorValue;
    label: HudColorValue;
    custom: HudColorValue;
    barFilled: string;
    barEmpty: string;
}
export declare const DEFAULT_ELEMENT_ORDER: HudElement[];
export declare const DEFAULT_MERGE_GROUPS: HudElement[][];
export interface GithubReviewsConfig {
    /** How reviewer status is rendered. `auto` shows names when ≤ maxNames, counts otherwise. */
    style: ReviewerStyleMode;
    maxNames: number;
    filterBots: boolean;
    /** Surface a stale glyph (↻) when a reviewer reviewed before subsequent commits. */
    showStale: boolean;
}
export type InboxScopeMode = 'current-repo' | 'all';
export interface GithubInboxConfig {
    enabled: boolean;
    /**
     * Which PRs the inbox includes:
     *   "current-repo" — only PRs in the same repo as the cwd (default)
     *   "all"          — every PR awaiting your review across all repos
     */
    scope: InboxScopeMode;
    /** Show author logins vs. just the count. */
    showAuthors: boolean;
    /** Max items to list before truncating to `+N`. */
    maxItems: number;
}
export interface GithubAnnouncementsConfig {
    enabled: boolean;
    /** Issue label that flags an item as an announcement. */
    label: string;
    /** Also include the repo's pinned issues even without the label. */
    includePinned: boolean;
    /** Max announcements to render. */
    maxItems: number;
}
export interface GithubConfig {
    enabled: boolean;
    /** Absolute path to the PR snapshot JSON written by the refresher binary. */
    snapshotPath: string;
    snapshotMaxAgeMs: number;
    reviews: GithubReviewsConfig;
    inbox: GithubInboxConfig;
    announcements: GithubAnnouncementsConfig;
}
export interface HudConfig {
    language: Language;
    lineLayout: LineLayoutType;
    showSeparators: boolean;
    pathLevels: 1 | 2 | 3;
    maxWidth: number | null;
    forceMaxWidth: boolean;
    elementOrder: HudElement[];
    gitStatus: {
        enabled: boolean;
        showDirty: boolean;
        showAheadBehind: boolean;
        showFileStats: boolean;
        branchOverflow: GitBranchOverflowMode;
        pushWarningThreshold: number;
        pushCriticalThreshold: number;
    };
    github: GithubConfig;
    display: {
        showModel: boolean;
        showProject: boolean;
        showAddedDirs: boolean;
        addedDirsLayout: AddedDirsLayout;
        showContextBar: boolean;
        contextValue: ContextValueMode;
        showConfigCounts: boolean;
        showCost: boolean;
        showDuration: boolean;
        showSpeed: boolean;
        showTokenBreakdown: boolean;
        showUsage: boolean;
        usageValue: UsageValueMode;
        usageBarEnabled: boolean;
        showResetLabel: boolean;
        usageCompact: boolean;
        showTools: boolean;
        showAgents: boolean;
        showTodos: boolean;
        showSessionName: boolean;
        showClaudeCodeVersion: boolean;
        showEffortLevel: boolean;
        showMemoryUsage: boolean;
        showPromptCache: boolean;
        promptCacheTtlSeconds: number;
        showSessionTokens: boolean;
        showOutputStyle: boolean;
        showSessionStartDate: boolean;
        showLastResponseAt: boolean;
        mergeGroups: HudElement[][];
        autocompactBuffer: AutocompactBufferMode;
        contextWarningThreshold: number;
        contextCriticalThreshold: number;
        usageThreshold: number;
        sevenDayThreshold: number;
        environmentThreshold: number;
        externalUsagePath: string;
        externalUsageFreshnessMs: number;
        modelFormat: ModelFormatMode;
        modelOverride: string;
        customLine: string;
        timeFormat: TimeFormatMode;
        /** Controls space between status glyphs (✓ ✗ ◐ ↑ ↓ etc.) and adjacent content. */
        glyphSpacing: GlyphSpacingMode;
    };
    colors: HudColorOverrides;
}
export declare const DEFAULT_CONFIG: HudConfig;
export declare function getConfigPath(): string;
export declare function mergeConfig(userConfig: Partial<HudConfig>): HudConfig;
/**
 * Resolve the final HudConfig by layering:
 *   1. defaults (in mergeConfig)
 *   2. user global config (~/.claude/plugins/claude-hud/config.json)
 *   3. per-repo config (<repo-root>/.claude-hud.json) — only when `cwd` is given
 *
 * Each layer deep-merges over the previous. Validation runs once on the
 * final composite so any layer can violate constraints without
 * corrupting the result.
 */
export declare function loadConfig(cwd?: string): Promise<HudConfig>;
//# sourceMappingURL=config.d.ts.map