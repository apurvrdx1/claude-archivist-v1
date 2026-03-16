import { encodeToon } from './toon.js'
import { appendToLog } from './storage.js'
import {
  type ArchiveEntry,
  InteractionType,
  Phase,
  Importance,
  EntryStatus,
} from './schema.js'

// ─── Entry ID generation ──────────────────────────────────────────────────────

export function nextEntryId(sessionDate: string, existingCount: number): string {
  const dateCompact = sessionDate.replace(/-/g, '')
  const seq = String(existingCount + 1).padStart(3, '0')
  return `${dateCompact}-${seq}`
}

// ─── Entry builder input type ─────────────────────────────────────────────────

export interface BuildEntryInput {
  entry_id: string
  session_date: string
  objective: string
  user_prompt: string
  assistant_response_summary: string
  project_name?: string
  project_path?: string
  interaction_type?: (typeof InteractionType)[keyof typeof InteractionType]
  phase?: (typeof Phase)[keyof typeof Phase]
  importance?: (typeof Importance)[keyof typeof Importance]
  status?: (typeof EntryStatus)[keyof typeof EntryStatus]
  assistant_actions?: string[]
  tools_used?: string[]
  mcps_used?: string[]
  files_touched?: string[]
  design_context?: string
  code_context?: string
  storytelling_context?: string
  voiceover_note?: string
  observations?: string
  decisions_made?: string[]
  prompts_of_note?: string[]
  errors_or_failures?: string
  bug_or_issue_state?: string
  visual_capture_refs?: string[]
  artifact_refs?: string[]
  outcome?: string
  next_open_loop?: string
  narrative_tags?: string[]
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildEntry(input: BuildEntryInput): ArchiveEntry {
  return {
    entry_id: input.entry_id,
    timestamp: new Date().toISOString(),
    session_date: input.session_date,
    project_name: input.project_name,
    project_path: input.project_path,
    interaction_type: input.interaction_type ?? InteractionType.implementation,
    phase: input.phase ?? Phase.build,
    importance: input.importance ?? Importance.medium,
    status: input.status ?? EntryStatus.in_progress,
    objective: input.objective,
    interaction: {
      user_prompt: input.user_prompt,
      assistant_response_summary: input.assistant_response_summary,
      assistant_actions: input.assistant_actions ?? [],
    },
    tooling: {
      tools_used: input.tools_used ?? [],
      mcps_used: input.mcps_used ?? [],
      files_touched: input.files_touched ?? [],
    },
    context: {
      design_context: input.design_context,
      code_context: input.code_context,
    },
    story: {
      storytelling_context: input.storytelling_context,
      voiceover_note: input.voiceover_note,
      observations: input.observations,
    },
    decisions: {
      decisions_made: input.decisions_made ?? [],
      prompts_of_note: input.prompts_of_note ?? [],
    },
    failures: {
      errors_or_failures: input.errors_or_failures,
      bug_or_issue_state: input.bug_or_issue_state,
    },
    artifacts: {
      visual_capture_refs: input.visual_capture_refs ?? [],
      artifact_refs: input.artifact_refs ?? [],
    },
    resolution: {
      outcome: input.outcome ?? '',
      next_open_loop: input.next_open_loop ?? '',
    },
    tags: {
      narrative_tags: input.narrative_tags ?? [],
    },
  }
}

// ─── Serialization ────────────────────────────────────────────────────────────

export function entryToToon(entry: ArchiveEntry): string {
  const separator = `# ─── Entry ${entry.entry_id} ──────────────────────────────────────────────────`

  // Flatten entry to a clean record, omitting undefined values
  const record: Record<string, unknown> = {}

  record['entry_id'] = entry.entry_id
  record['timestamp'] = entry.timestamp
  record['session_date'] = entry.session_date
  if (entry.project_name) record['project_name'] = entry.project_name
  if (entry.project_path) record['project_path'] = entry.project_path
  record['interaction_type'] = entry.interaction_type
  record['phase'] = entry.phase
  record['importance'] = entry.importance
  record['status'] = entry.status
  record['objective'] = entry.objective

  // Interaction section
  const interaction: Record<string, unknown> = {
    user_prompt: entry.interaction.user_prompt,
    assistant_response_summary: entry.interaction.assistant_response_summary,
  }
  if (entry.interaction.assistant_actions.length > 0) {
    interaction['assistant_actions'] = entry.interaction.assistant_actions
  }
  record['interaction'] = interaction

  // Tooling section
  record['tooling'] = {
    tools_used: entry.tooling.tools_used,
    mcps_used: entry.tooling.mcps_used,
    files_touched: entry.tooling.files_touched,
  }

  // Context section — only include non-empty fields
  const context: Record<string, unknown> = {}
  if (entry.context.design_context) context['design_context'] = entry.context.design_context
  if (entry.context.code_context) context['code_context'] = entry.context.code_context
  if (Object.keys(context).length > 0) record['context'] = context

  // Story section
  const story: Record<string, unknown> = {}
  if (entry.story.storytelling_context) story['storytelling_context'] = entry.story.storytelling_context
  if (entry.story.voiceover_note) story['voiceover_note'] = entry.story.voiceover_note
  if (entry.story.observations) story['observations'] = entry.story.observations
  if (Object.keys(story).length > 0) record['story'] = story

  // Decisions
  if (entry.decisions.decisions_made.length > 0 || entry.decisions.prompts_of_note.length > 0) {
    record['decisions'] = {
      decisions_made: entry.decisions.decisions_made,
      prompts_of_note: entry.decisions.prompts_of_note,
    }
  }

  // Failures
  const failures: Record<string, unknown> = {}
  if (entry.failures.errors_or_failures) failures['errors_or_failures'] = entry.failures.errors_or_failures
  if (entry.failures.bug_or_issue_state) failures['bug_or_issue_state'] = entry.failures.bug_or_issue_state
  if (Object.keys(failures).length > 0) record['failures'] = failures

  // Artifacts
  if (entry.artifacts.visual_capture_refs.length > 0 || entry.artifacts.artifact_refs.length > 0) {
    record['artifacts'] = {
      visual_capture_refs: entry.artifacts.visual_capture_refs,
      artifact_refs: entry.artifacts.artifact_refs,
    }
  }

  // Resolution
  if (entry.resolution.outcome || entry.resolution.next_open_loop) {
    record['resolution'] = {
      outcome: entry.resolution.outcome,
      next_open_loop: entry.resolution.next_open_loop,
    }
  }

  // Tags
  if (entry.tags.narrative_tags.length > 0) {
    record['tags'] = { narrative_tags: entry.tags.narrative_tags }
  }

  const toon = encodeToon(record as Record<string, import('./toon.js').ToonValue>)
  return `${separator}\n${toon}`
}

// ─── Write to disk ────────────────────────────────────────────────────────────

export async function writeEntry(
  projectPath: string,
  sessionDate: string,
  entry: ArchiveEntry
): Promise<void> {
  const toon = entryToToon(entry)
  await appendToLog(projectPath, sessionDate, toon)
}
