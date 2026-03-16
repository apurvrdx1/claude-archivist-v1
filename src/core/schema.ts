// ─── Enums ───────────────────────────────────────────────────────────────────

export const InteractionType = {
  ideation: 'ideation',
  exploration: 'exploration',
  refinement: 'refinement',
  bug_fixing: 'bug_fixing',
  implementation: 'implementation',
  review: 'review',
  validation: 'validation',
  content_generation: 'content_generation',
} as const
export type InteractionType = (typeof InteractionType)[keyof typeof InteractionType]

export const Phase = {
  discovery: 'discovery',
  concepting: 'concepting',
  design: 'design',
  build: 'build',
  testing: 'testing',
  polish: 'polish',
  shipping: 'shipping',
  reflection: 'reflection',
} as const
export type Phase = (typeof Phase)[keyof typeof Phase]

export const Importance = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
} as const
export type Importance = (typeof Importance)[keyof typeof Importance]

export const EntryStatus = {
  in_progress: 'in_progress',
  blocked: 'blocked',
  resolved: 'resolved',
  archived: 'archived',
  shipped_candidate: 'shipped_candidate',
} as const
export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus]

export const ProjectPhase = {
  discovery: 'discovery',
  design: 'design',
  build: 'build',
  polish: 'polish',
  shipped: 'shipped',
} as const
export type ProjectPhase = (typeof ProjectPhase)[keyof typeof ProjectPhase]

export const NarrativeTag = {
  pivot: 'pivot',
  breakthrough: 'breakthrough',
  confusion: 'confusion',
  failure: 'failure',
  recovery: 'recovery',
  iteration: 'iteration',
  polish: 'polish',
  shipped: 'shipped',
  bug_fix: 'bug_fix',
  ai_caught_it: 'ai_caught_it',
  before_after: 'before_after',
  browser_quirk: 'browser_quirk',
} as const
export type NarrativeTag = string // open-ended — user may invent tags

// ─── Entry Sub-types ─────────────────────────────────────────────────────────

export interface EntryInteraction {
  user_prompt: string
  assistant_response_summary: string
  assistant_actions: string[]
}

export interface EntryTooling {
  tools_used: string[]
  mcps_used: string[]
  files_touched: string[]
}

export interface EntryContext {
  design_context?: string
  code_context?: string
}

export interface EntryStory {
  storytelling_context?: string
  voiceover_note?: string
  observations?: string
}

export interface EntryDecisions {
  decisions_made: string[]
  prompts_of_note: string[]
}

export interface EntryFailures {
  errors_or_failures?: string
  bug_or_issue_state?: string
}

export interface EntryArtifacts {
  visual_capture_refs: string[]
  artifact_refs: string[]
}

export interface EntryResolution {
  outcome: string
  next_open_loop: string
}

export interface EntryTags {
  narrative_tags: string[]
}

// ─── Canonical Archive Entry ──────────────────────────────────────────────────

export interface ArchiveEntry {
  entry_id: string
  timestamp: string
  session_date: string
  project_name?: string
  project_path?: string
  interaction_type: InteractionType
  phase: Phase
  importance: Importance
  status: EntryStatus
  objective: string
  interaction: EntryInteraction
  tooling: EntryTooling
  context: EntryContext
  story: EntryStory
  decisions: EntryDecisions
  failures: EntryFailures
  artifacts: EntryArtifacts
  resolution: EntryResolution
  tags: EntryTags
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface CaptureConfig {
  devserver_ports: number[]
  figma_mcp: boolean
  paper_mcp: boolean
  breakpoints: number[]
}

export interface ArchivistConfig {
  project_name: string
  archiving: boolean
  archive_path: string
  pause_threshold: number
  phase: ProjectPhase
  capture: CaptureConfig
}

/** Canonical archive root folder name. Single source of truth. */
export const ARCHIVE_ROOT = 'documentation_notes'

/** Returns a deep copy of the default config — safe to mutate. */
export function getDefaultConfig(): ArchivistConfig {
  return {
    project_name: 'untitled-project',
    archiving: false,
    archive_path: ARCHIVE_ROOT,
    pause_threshold: 5,
    phase: ProjectPhase.build,
    capture: {
      devserver_ports: [3000, 5173, 8080, 4000, 4321],
      figma_mcp: true,
      paper_mcp: true,
      breakpoints: [375, 414, 768, 1280],
    },
  }
}

/** @deprecated Use getDefaultConfig() to avoid shared mutable reference. */
export const DEFAULT_CONFIG: ArchivistConfig = getDefaultConfig()

// ─── Session Meta ─────────────────────────────────────────────────────────────

export interface SessionMeta {
  session_id: string
  session_date: string
  project_name: string
  project_path: string
  opened_at: string
  closed_at?: string
  entry_count: number
  artifacts_count: number
  open_loops: string[]
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateEntry(entry: unknown): entry is ArchiveEntry {
  if (typeof entry !== 'object' || entry === null) return false
  const e = entry as Record<string, unknown>

  // Required scalar fields
  if (typeof e['entry_id'] !== 'string') return false
  if (typeof e['timestamp'] !== 'string') return false
  if (typeof e['session_date'] !== 'string') return false
  if (typeof e['objective'] !== 'string') return false

  // Required nested objects — prevents runtime crashes on destructuring
  if (typeof e['interaction'] !== 'object' || e['interaction'] === null) return false
  if (typeof e['tooling'] !== 'object' || e['tooling'] === null) return false
  if (typeof e['resolution'] !== 'object' || e['resolution'] === null) return false
  if (typeof e['artifacts'] !== 'object' || e['artifacts'] === null) return false

  return true
}

export function validateConfig(config: unknown): config is ArchivistConfig {
  if (typeof config !== 'object' || config === null) return false
  const c = config as Record<string, unknown>

  if (typeof c['project_name'] !== 'string') return false
  if (typeof c['archiving'] !== 'boolean') return false
  if (typeof c['archive_path'] !== 'string') return false
  if (typeof c['pause_threshold'] !== 'number') return false
  if (c['pause_threshold'] <= 0) return false

  // Validate phase is a known value
  const validPhases = Object.values(ProjectPhase) as string[]
  if (typeof c['phase'] !== 'string' || !validPhases.includes(c['phase'])) return false

  // Validate capture sub-object — prevents crashes in visual capture layer
  if (typeof c['capture'] !== 'object' || c['capture'] === null) return false
  const cap = c['capture'] as Record<string, unknown>
  if (!Array.isArray(cap['devserver_ports'])) return false
  if (typeof cap['figma_mcp'] !== 'boolean') return false
  if (typeof cap['paper_mcp'] !== 'boolean') return false
  if (!Array.isArray(cap['breakpoints'])) return false

  return true
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEmptyEntry(
  entry_id: string,
  session_date: string,
  objective: string,
  overrides: Partial<ArchiveEntry> = {}
): ArchiveEntry {
  return {
    entry_id,
    timestamp: new Date().toISOString(),
    session_date,
    interaction_type: InteractionType.implementation,
    phase: Phase.build,
    importance: Importance.medium,
    status: EntryStatus.in_progress,
    objective,
    interaction: {
      user_prompt: '',
      assistant_response_summary: '',
      assistant_actions: [],
    },
    tooling: {
      tools_used: [],
      mcps_used: [],
      files_touched: [],
    },
    context: {},
    story: {},
    decisions: {
      decisions_made: [],
      prompts_of_note: [],
    },
    failures: {},
    artifacts: {
      visual_capture_refs: [],
      artifact_refs: [],
    },
    resolution: {
      outcome: '',
      next_open_loop: '',
    },
    tags: {
      narrative_tags: [],
    },
    ...overrides,
  }
}
