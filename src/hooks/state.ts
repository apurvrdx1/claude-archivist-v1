/**
 * Hook state manager.
 * Persists a small JSON blob in /tmp/archivist-{projectHash}/state.json
 * so that tool call counters and session checks survive across tool invocations
 * within the same Claude Code session.
 */
import { mkdir, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createHash } from 'crypto'

export interface HookState {
  /** ISO date of the current session day, e.g. "2026-03-16" */
  session_date: string
  /** Whether the session-start greeting has fired today */
  greeted_today: boolean
  /** Number of tool calls since the last archive prompt */
  tool_calls_since_archive: number
  /** Timestamp of the last archive prompt offered */
  last_archive_prompt_at: string | null
  /** Whether the user declined archiving for today (don't ask again) */
  declined_today: boolean
}

const DEFAULT_STATE: HookState = {
  session_date: '',
  greeted_today: false,
  tool_calls_since_archive: 0,
  last_archive_prompt_at: null,
  declined_today: false,
}

function stateDir(projectPath: string): string {
  const hash = createHash('sha1').update(projectPath).digest('hex').slice(0, 8)
  return join(tmpdir(), `archivist-${hash}`)
}

function statePath(projectPath: string): string {
  return join(stateDir(projectPath), 'state.json')
}

export async function readState(projectPath: string): Promise<HookState> {
  try {
    const raw = await readFile(statePath(projectPath), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<HookState>
    // Reset stale state if it's from a different day
    const today = new Date().toISOString().slice(0, 10)
    if (parsed.session_date !== today) {
      return { ...DEFAULT_STATE, session_date: today }
    }
    return { ...DEFAULT_STATE, ...parsed }
  } catch {
    return { ...DEFAULT_STATE, session_date: new Date().toISOString().slice(0, 10) }
  }
}

export async function writeState(projectPath: string, state: HookState): Promise<void> {
  await mkdir(stateDir(projectPath), { recursive: true })
  await writeFile(statePath(projectPath), JSON.stringify(state, null, 2), 'utf-8')
}

export async function incrementToolCount(projectPath: string): Promise<HookState> {
  const state = await readState(projectPath)
  const next = { ...state, tool_calls_since_archive: state.tool_calls_since_archive + 1 }
  await writeState(projectPath, next)
  return next
}

export async function resetToolCount(projectPath: string): Promise<void> {
  const state = await readState(projectPath)
  await writeState(projectPath, {
    ...state,
    tool_calls_since_archive: 0,
    last_archive_prompt_at: new Date().toISOString(),
  })
}

export async function markGreeted(projectPath: string): Promise<void> {
  const state = await readState(projectPath)
  await writeState(projectPath, { ...state, greeted_today: true })
}

export async function markDeclined(projectPath: string): Promise<void> {
  const state = await readState(projectPath)
  await writeState(projectPath, { ...state, declined_today: true })
}
