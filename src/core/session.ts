import { readLog, readConfig, scaffoldProjectArchive, ensureDayFolder, appendToLog } from './storage.js'
import { type ArchivistConfig, type SessionMeta } from './schema.js'
import { encodeToon } from './toon.js'

// ─── Session status ────────────────────────────────────────────────────────────

export interface SessionStatus {
  state: 'no_config' | 'archiving_off' | 'active'
  config: ArchivistConfig | null
}

export async function getSessionStatus(projectPath: string): Promise<SessionStatus> {
  const config = await readConfig(projectPath)
  if (!config) return { state: 'no_config', config: null }
  if (!config.archiving) return { state: 'archiving_off', config }
  return { state: 'active', config }
}

// ─── Session ID generation ─────────────────────────────────────────────────────

function generateSessionId(date: string): string {
  const compact = date.replace(/-/g, '')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `sess-${compact}-${rand}`
}

// ─── Open session ─────────────────────────────────────────────────────────────

export async function openSession(projectPath: string, date: string): Promise<SessionMeta> {
  const config = await readConfig(projectPath)
  const projectName = config?.project_name ?? 'untitled-project'

  await ensureDayFolder(projectPath, date)

  const meta: SessionMeta = {
    session_id: generateSessionId(date),
    session_date: date,
    project_name: projectName,
    project_path: projectPath,
    opened_at: new Date().toISOString(),
    entry_count: 0,
    artifacts_count: 0,
    open_loops: [],
  }

  await writeSessionEvent(projectPath, date, 'session_open', {
    session_id: meta.session_id,
    project_name: meta.project_name,
    opened_at: meta.opened_at,
  })

  return meta
}

// ─── Close session ────────────────────────────────────────────────────────────

export async function closeSession(
  projectPath: string,
  date: string,
  meta: SessionMeta
): Promise<SessionMeta> {
  const closed: SessionMeta = {
    ...meta,
    closed_at: new Date().toISOString(),
  }

  const eventData: Record<string, unknown> = {
    session_id: closed.session_id,
    closed_at: closed.closed_at,
    entry_count: closed.entry_count,
    artifacts_count: closed.artifacts_count,
  }

  if (closed.open_loops.length > 0) {
    eventData['open_loops'] = closed.open_loops
  }

  await writeSessionEvent(projectPath, date, 'session_close', eventData)

  return closed
}

// ─── Session event writer ─────────────────────────────────────────────────────

async function writeSessionEvent(
  projectPath: string,
  date: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const separator = `# ─── ${eventType} ─────────────────────────────────────────────────────────`
  const record: Record<string, unknown> = {
    event: eventType,
    timestamp: new Date().toISOString(),
    ...data,
  }
  const toon = encodeToon(record)
  await appendToLog(projectPath, date, `${separator}\n${toon}`)
}

// ─── Enable archiving ─────────────────────────────────────────────────────────

export async function enableArchiving(
  projectPath: string,
  projectName: string
): Promise<ArchivistConfig> {
  const { getDefaultConfig } = await import('./schema.js')
  const config: ArchivistConfig = {
    ...getDefaultConfig(),
    project_name: projectName,
    archiving: true,
  }
  await scaffoldProjectArchive(projectPath, config)
  return config
}

// ─── Count entries ────────────────────────────────────────────────────────────

export async function countEntriesInLog(projectPath: string, date: string): Promise<number> {
  const log = await readLog(projectPath, date)
  if (!log) return 0
  // Count only archival Entry separators — exclude session_open/session_close events
  const matches = log.match(/^# ─── Entry /gm)
  return matches?.length ?? 0
}

// ─── Format summary ───────────────────────────────────────────────────────────

export function formatSessionSummary(meta: SessionMeta): string {
  const lines: string[] = [
    `═══════════════════════════════════════════`,
    `  Archivist Session Summary`,
    `═══════════════════════════════════════════`,
    `  Project   : ${meta.project_name}`,
    `  Date      : ${meta.session_date}`,
    `  Session   : ${meta.session_id}`,
    `  Entries   : ${meta.entry_count}`,
    `  Artifacts : ${meta.artifacts_count}`,
  ]

  if (meta.closed_at) {
    const opened = new Date(meta.opened_at)
    const closed = new Date(meta.closed_at)
    const durationMs = closed.getTime() - opened.getTime()
    const mins = Math.round(durationMs / 60000)
    lines.push(`  Duration  : ${mins}m`)
  }

  if (meta.open_loops.length > 0) {
    lines.push(`  Open loops:`)
    meta.open_loops.forEach(loop => lines.push(`    → ${loop}`))
  }

  lines.push(`═══════════════════════════════════════════`)
  return lines.join('\n')
}
