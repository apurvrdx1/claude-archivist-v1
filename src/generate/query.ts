/**
 * Query engine for archive entries.
 * Reads TOON log files across date folders, parses entries, applies filters.
 */
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { decodeToon } from '../core/toon.js'
import {
  ARCHIVE_ROOT,
  InteractionType,
  Phase,
  Importance,
  EntryStatus,
  type ArchiveEntry,
} from '../core/schema.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QueryFilter {
  /** Inclusive start date — YYYY-MM-DD */
  from?: string
  /** Inclusive end date — YYYY-MM-DD */
  to?: string
  phase?: string
  importance?: string
  /** Narrative tag — matches if the entry has this tag */
  tag?: string
  /** Interaction type */
  type?: string
}

export interface QueryResult {
  entries: ArchiveEntry[]
  /** Date folders that were actually scanned (after date filtering) */
  dates: string[]
  total: number
}

// ─── Date folder listing ──────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function listAvailableDates(projectPath: string): Promise<string[]> {
  const recordsDir = join(projectPath, ARCHIVE_ROOT, 'records')
  try {
    const entries = await readdir(recordsDir, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && DATE_RE.test(e.name))
      .map(e => e.name)
      .sort()
  } catch {
    return []
  }
}

// ─── Raw record → ArchiveEntry reconstruction ─────────────────────────────────
//
// `entryToToon` omits optional sections when they are empty (no artifacts,
// no resolution text, no story, etc.). When parsing back we must fill defaults
// so we always return a complete ArchiveEntry, never a partial object.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  return []
}

function toStringOrUndef(v: unknown): string | undefined {
  if (typeof v === 'string' && v) return v
  return undefined
}

function rawToEntry(raw: Raw): ArchiveEntry | null {
  if (typeof raw['entry_id'] !== 'string') return null
  if (typeof raw['timestamp'] !== 'string') return null
  if (typeof raw['session_date'] !== 'string') return null
  if (typeof raw['objective'] !== 'string') return null

  const interaction: Raw = (typeof raw['interaction'] === 'object' && raw['interaction']) ? raw['interaction'] : {}
  const tooling: Raw    = (typeof raw['tooling'] === 'object' && raw['tooling']) ? raw['tooling'] : {}
  const resolution: Raw = (typeof raw['resolution'] === 'object' && raw['resolution']) ? raw['resolution'] : {}
  const artifacts: Raw  = (typeof raw['artifacts'] === 'object' && raw['artifacts']) ? raw['artifacts'] : {}
  const story: Raw      = (typeof raw['story'] === 'object' && raw['story']) ? raw['story'] : {}
  const decisions: Raw  = (typeof raw['decisions'] === 'object' && raw['decisions']) ? raw['decisions'] : {}
  const failures: Raw   = (typeof raw['failures'] === 'object' && raw['failures']) ? raw['failures'] : {}
  const context: Raw    = (typeof raw['context'] === 'object' && raw['context']) ? raw['context'] : {}
  const tags: Raw       = (typeof raw['tags'] === 'object' && raw['tags']) ? raw['tags'] : {}

  return {
    entry_id:         raw['entry_id'],
    timestamp:        raw['timestamp'],
    session_date:     raw['session_date'],
    project_name:     toStringOrUndef(raw['project_name']),
    project_path:     toStringOrUndef(raw['project_path']),
    interaction_type: (raw['interaction_type'] as typeof InteractionType[keyof typeof InteractionType]) ?? InteractionType.implementation,
    phase:            (raw['phase'] as typeof Phase[keyof typeof Phase]) ?? Phase.build,
    importance:       (raw['importance'] as typeof Importance[keyof typeof Importance]) ?? Importance.medium,
    status:           (raw['status'] as typeof EntryStatus[keyof typeof EntryStatus]) ?? EntryStatus.resolved,
    objective:        raw['objective'],
    interaction: {
      user_prompt:                  String(interaction['user_prompt'] ?? ''),
      assistant_response_summary:   String(interaction['assistant_response_summary'] ?? ''),
      assistant_actions:            toStringArray(interaction['assistant_actions']),
    },
    tooling: {
      tools_used:    toStringArray(tooling['tools_used']),
      mcps_used:     toStringArray(tooling['mcps_used']),
      files_touched: toStringArray(tooling['files_touched']),
    },
    context: {
      design_context: toStringOrUndef(context['design_context']),
      code_context:   toStringOrUndef(context['code_context']),
    },
    story: {
      storytelling_context: toStringOrUndef(story['storytelling_context']),
      voiceover_note:       toStringOrUndef(story['voiceover_note']),
      observations:         toStringOrUndef(story['observations']),
    },
    decisions: {
      decisions_made:   toStringArray(decisions['decisions_made']),
      prompts_of_note:  toStringArray(decisions['prompts_of_note']),
    },
    failures: {
      errors_or_failures: toStringOrUndef(failures['errors_or_failures']),
      bug_or_issue_state: toStringOrUndef(failures['bug_or_issue_state']),
    },
    artifacts: {
      visual_capture_refs: toStringArray(artifacts['visual_capture_refs']),
      artifact_refs:       toStringArray(artifacts['artifact_refs']),
    },
    resolution: {
      outcome:       String(resolution['outcome'] ?? ''),
      next_open_loop: String(resolution['next_open_loop'] ?? ''),
    },
    tags: {
      narrative_tags: toStringArray(tags['narrative_tags']),
    },
  }
}

// ─── Log parser ───────────────────────────────────────────────────────────────

// Matches the full entry separator line, e.g.:
//   # ─── Entry 20260316-001 ──────────────────────────────────────────────────
const ENTRY_SEP_RE = /^# ─── Entry [^\n]+/m

/**
 * Parse all ArchiveEntry objects out of a raw log string.
 * Entries are separated by `# ─── Entry <id>` header lines.
 * Session events (session_open, session_close) are ignored.
 */
export function parseEntriesFromLog(log: string): ArchiveEntry[] {
  if (!log.trim()) return []

  // Split on entry separator lines — everything after each header is a TOON block
  const parts = log.split(ENTRY_SEP_RE)
  // parts[0] is content before the first Entry separator (session events etc.)
  // parts[1..n] are the TOON blocks

  const entries: ArchiveEntry[] = []

  for (const part of parts.slice(1)) {
    const trimmed = part.trim()
    if (!trimmed) continue
    try {
      const decoded = decodeToon(trimmed)
      const entry = rawToEntry(decoded)
      if (entry) entries.push(entry)
    } catch {
      // Skip malformed blocks — one bad entry must not corrupt the whole query
    }
  }

  return entries
}

// ─── Filter engine ────────────────────────────────────────────────────────────

function applyFilter(entry: ArchiveEntry, filter: QueryFilter): boolean {
  if (filter.phase && entry.phase !== filter.phase) return false
  if (filter.importance && entry.importance !== filter.importance) return false
  if (filter.type && entry.interaction_type !== filter.type) return false
  if (filter.tag) {
    const tags = entry.tags?.narrative_tags ?? []
    if (!tags.includes(filter.tag)) return false
  }
  return true
}

// ─── Main query function ──────────────────────────────────────────────────────

export async function queryEntries(projectPath: string, filter: QueryFilter): Promise<QueryResult> {
  const allDates = await listAvailableDates(projectPath)

  // Apply date range filter on folder names (lexicographic comparison works for YYYY-MM-DD)
  const dates = allDates.filter(date => {
    if (filter.from && date < filter.from) return false
    if (filter.to && date > filter.to) return false
    return true
  })

  const entries: ArchiveEntry[] = []

  for (const date of dates) {
    const logPath = join(projectPath, ARCHIVE_ROOT, 'records', date, 'daily_log.toon')
    let log = ''
    try {
      log = await readFile(logPath, 'utf-8')
    } catch {
      continue // No log for this date — skip silently
    }
    const parsed = parseEntriesFromLog(log)
    const filtered = parsed.filter(e => applyFilter(e, filter))
    entries.push(...filtered)
  }

  return { entries, dates, total: entries.length }
}
