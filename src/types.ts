import type { HudConfig } from './config.js';
import type { GitStatus } from './git.js';

export interface StdinData {
  transcript_path?: string;
  cwd?: string;
  workspace?: {
    current_dir?: string;
    project_dir?: string;
    added_dirs?: string[];
    git_worktree?: string;
  } | null;
  model?: {
    id?: string;
    display_name?: string;
  };
  context_window?: {
    context_window_size?: number;
    total_input_tokens?: number | null;
    total_output_tokens?: number | null;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
    // Native percentage fields (Claude Code v2.1.6+)
    used_percentage?: number | null;
    remaining_percentage?: number | null;
  };
  cost?: {
    total_cost_usd?: number | null;
    total_duration_ms?: number | null;
    total_api_duration_ms?: number | null;
    total_lines_added?: number | null;
    total_lines_removed?: number | null;
  } | null;
  rate_limits?: {
    five_hour?: {
      used_percentage?: number | null;
      resets_at?: number | null;
    } | null;
    seven_day?: {
      used_percentage?: number | null;
      resets_at?: number | null;
    } | null;
  } | null;
  // Claude Code 2.1.115+ exposes effort as an object: { level: "max" }.
  // Earlier versions (≤2.1.114) did not send this field at all. The bare-string
  // shape is kept for backwards compatibility with the original PR #471 design
  // that future-proofed a string form before Anthropic had committed a schema.
  effort?: string | { level?: string | null; [key: string]: unknown } | null;
}

export interface ToolEntry {
  id: string;
  name: string;
  target?: string;
  status: 'running' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
}

export interface AgentEntry {
  id: string;
  type: string;
  model?: string;
  description?: string;
  status: 'running' | 'completed';
  startTime: Date;
  endTime?: Date;
  background?: boolean;
}

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface UsageData {
  fiveHour: number | null;  // 0-100 percentage, null if unavailable
  sevenDay: number | null;  // 0-100 percentage, null if unavailable
  fiveHourResetAt: Date | null;
  sevenDayResetAt: Date | null;
  balanceLabel?: string | null;  // optional raw balance text (e.g. "¥6.35")
}

export interface ExternalUsageSnapshot {
  five_hour?: {
    used_percentage?: number | null;
    resets_at?: string | number | null;
  } | null;
  seven_day?: {
    used_percentage?: number | null;
    resets_at?: string | number | null;
  } | null;
  updated_at?: string | number | null;
  balance_label?: string | null;
}

export interface MemoryInfo {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

/** Check if usage limit is reached (either window at 100%) */
export function isLimitReached(data: UsageData): boolean {
  return data.fiveHour === 100 || data.sevenDay === 100;
}

export interface SessionTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface TranscriptData {
  tools: ToolEntry[];
  agents: AgentEntry[];
  todos: TodoItem[];
  sessionStart?: Date;
  sessionName?: string;
  lastAssistantResponseAt?: Date;
  sessionTokens?: SessionTokenUsage;
  lastCompactBoundaryAt?: Date;
  lastCompactPostTokens?: number;
}

export type ReviewState = 'approved' | 'changes_requested' | 'commented' | 'pending';

export interface ReviewerStatus {
  login: string;
  state: ReviewState;
  isStale?: boolean;
  isBot?: boolean;
}

export interface CiCheckCounts {
  success: number;
  failure: number;
  pending: number;
  total: number;
}

export type ShipVerdict = 'ready' | 'warning' | 'blocked' | 'unknown';

export type PrSnapshotError =
  | 'gh-unauthed'
  | 'no-gh'
  | 'non-github'
  | 'no-pr'
  | 'fetch-failed'
  | 'no-remote';

export interface PrStatus {
  number: number;
  title: string;
  url: string;
  headBranch: string;
  baseBranch: string;
  draft: boolean;
  mergeable: 'mergeable' | 'conflicting' | 'unknown';
  reviewers: ReviewerStatus[];
  /** Logins of reviewers requested but who have not yet submitted a review. */
  pendingRequests: string[];
  ci: CiCheckCounts;
  shipVerdict: ShipVerdict;
  /** Optional reason summary used when verdict is not 'ready' (e.g., "12 commits behind main"). */
  shipReason?: string;
}

export interface PrSnapshot {
  /** ISO timestamp the snapshot was written. */
  updatedAt: string;
  repo: { owner: string; name: string } | null;
  branch: string | null;
  pr: PrStatus | null;
  error?: PrSnapshotError;
}

export interface RenderContext {
  stdin: StdinData;
  transcript: TranscriptData;
  claudeMdCount: number;
  rulesCount: number;
  mcpCount: number;
  hooksCount: number;
  sessionDuration: string;
  gitStatus: GitStatus | null;
  usageData: UsageData | null;
  memoryUsage: MemoryInfo | null;
  config: HudConfig;
  extraLabel: string | null;
  outputStyle?: string;
  claudeCodeVersion?: string;
  effortLevel?: string;
  effortSymbol?: string;
  prSnapshot: PrSnapshot | null;
}
