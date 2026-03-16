import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseEntriesFromLog, queryEntries, listAvailableDates } from './query.js'
import { entryToToon } from '../core/logger.js'
import { buildEntry } from '../core/logger.js'
import { InteractionType, Phase, Importance, EntryStatus } from '../core/schema.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<Parameters<typeof buildEntry>[0]> = {}) {
  return buildEntry({
    entry_id: '20260316-001',
    session_date: '2026-03-16',
    objective: 'Test objective',
    user_prompt: 'Do something',
    assistant_response_summary: 'Did something',
    interaction_type: InteractionType.implementation,
    phase: Phase.build,
    importance: Importance.medium,
    status: EntryStatus.resolved,
    narrative_tags: [],
    ...overrides,
  })
}

function makeFakeLog(...entries: ReturnType<typeof makeEntry>[]): string {
  return entries.map(e => entryToToon(e)).join('\n')
}

// ─── parseEntriesFromLog ──────────────────────────────────────────────────────

describe('parseEntriesFromLog', () => {
  it('returns empty array for empty string', () => {
    expect(parseEntriesFromLog('')).toEqual([])
  })

  it('returns empty array for session events only', () => {
    const log = `
# ─── session_open ────────────────────────────────────────────────────────────
event: session_open
timestamp: 2026-03-16T00:00:00.000Z
`
    expect(parseEntriesFromLog(log)).toEqual([])
  })

  it('parses a single entry', () => {
    const entry = makeEntry()
    const log = makeFakeLog(entry)
    const results = parseEntriesFromLog(log)
    expect(results).toHaveLength(1)
    expect(results[0]!.entry_id).toBe('20260316-001')
    expect(results[0]!.objective).toBe('Test objective')
  })

  it('parses multiple entries from the same log', () => {
    const e1 = makeEntry({ entry_id: '20260316-001', objective: 'First task' })
    const e2 = makeEntry({ entry_id: '20260316-002', objective: 'Second task' })
    const e3 = makeEntry({ entry_id: '20260316-003', objective: 'Third task' })
    const log = makeFakeLog(e1, e2, e3)
    const results = parseEntriesFromLog(log)
    expect(results).toHaveLength(3)
    expect(results.map(e => e.objective)).toEqual(['First task', 'Second task', 'Third task'])
  })

  it('skips malformed blocks without throwing', () => {
    const e = makeEntry()
    const log = `${entryToToon(e)}\n# ─── Entry 99999999-bad ────────────────────\nnot valid toon at all ::::`
    const results = parseEntriesFromLog(log)
    // The first entry should still parse; the bad one is skipped
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('parses entries mixed with session events', () => {
    const e1 = makeEntry({ entry_id: '20260316-001' })
    const e2 = makeEntry({ entry_id: '20260316-002' })
    const sessionOpen = `# ─── session_open ────────────────────────────────────────────────────────────\nevent: session_open\n`
    const sessionClose = `# ─── session_close ──────────────────────────────────────────────────────────\nevent: session_close\n`
    const log = `${sessionOpen}${entryToToon(e1)}\n${entryToToon(e2)}\n${sessionClose}`
    const results = parseEntriesFromLog(log)
    expect(results).toHaveLength(2)
  })
})

// ─── listAvailableDates ───────────────────────────────────────────────────────

describe('listAvailableDates', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'archivist-query-test-'))
    await mkdir(join(tmpDir, 'documentation_notes', 'records', '2026-03-14'), { recursive: true })
    await mkdir(join(tmpDir, 'documentation_notes', 'records', '2026-03-15'), { recursive: true })
    await mkdir(join(tmpDir, 'documentation_notes', 'records', '2026-03-16'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('lists all date folders in sorted order', async () => {
    const dates = await listAvailableDates(tmpDir)
    expect(dates).toEqual(['2026-03-14', '2026-03-15', '2026-03-16'])
  })

  it('returns empty array when no records exist', async () => {
    const dates = await listAvailableDates(join(tmpDir, 'nonexistent-project'))
    expect(dates).toEqual([])
  })

  it('filters out non-date folders', async () => {
    await mkdir(join(tmpDir, 'documentation_notes', 'records', 'generated_content'), { recursive: true })
    const dates = await listAvailableDates(tmpDir)
    expect(dates).not.toContain('generated_content')
  })
})

// ─── queryEntries ─────────────────────────────────────────────────────────────

describe('queryEntries', () => {
  let tmpDir: string

  async function writeLog(date: string, entries: ReturnType<typeof makeEntry>[]) {
    const dir = join(tmpDir, 'documentation_notes', 'records', date)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'daily_log.toon'), makeFakeLog(...entries), 'utf-8')
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'archivist-query-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns all entries with no filter', async () => {
    await writeLog('2026-03-15', [
      makeEntry({ entry_id: '20260315-001', objective: 'Day 1 task' }),
    ])
    await writeLog('2026-03-16', [
      makeEntry({ entry_id: '20260316-001', objective: 'Day 2 task A' }),
      makeEntry({ entry_id: '20260316-002', objective: 'Day 2 task B' }),
    ])
    const result = await queryEntries(tmpDir, {})
    expect(result.total).toBe(3)
    expect(result.dates).toEqual(['2026-03-15', '2026-03-16'])
  })

  it('filters by from date', async () => {
    await writeLog('2026-03-14', [makeEntry({ entry_id: '20260314-001' })])
    await writeLog('2026-03-16', [makeEntry({ entry_id: '20260316-001' })])
    const result = await queryEntries(tmpDir, { from: '2026-03-15' })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.entry_id).toBe('20260316-001')
  })

  it('filters by to date', async () => {
    await writeLog('2026-03-14', [makeEntry({ entry_id: '20260314-001' })])
    await writeLog('2026-03-16', [makeEntry({ entry_id: '20260316-001' })])
    const result = await queryEntries(tmpDir, { to: '2026-03-15' })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.entry_id).toBe('20260314-001')
  })

  it('filters by exact date', async () => {
    await writeLog('2026-03-15', [makeEntry({ entry_id: '20260315-001' })])
    await writeLog('2026-03-16', [makeEntry({ entry_id: '20260316-001' })])
    const result = await queryEntries(tmpDir, { from: '2026-03-15', to: '2026-03-15' })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.entry_id).toBe('20260315-001')
  })

  it('filters by phase', async () => {
    await writeLog('2026-03-16', [
      makeEntry({ entry_id: '20260316-001', phase: Phase.build }),
      makeEntry({ entry_id: '20260316-002', phase: Phase.design }),
    ])
    const result = await queryEntries(tmpDir, { phase: Phase.design })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.phase).toBe(Phase.design)
  })

  it('filters by importance', async () => {
    await writeLog('2026-03-16', [
      makeEntry({ entry_id: '20260316-001', importance: Importance.low }),
      makeEntry({ entry_id: '20260316-002', importance: Importance.critical }),
    ])
    const result = await queryEntries(tmpDir, { importance: Importance.critical })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.importance).toBe(Importance.critical)
  })

  it('filters by narrative tag', async () => {
    await writeLog('2026-03-16', [
      makeEntry({ entry_id: '20260316-001', narrative_tags: ['pivot', 'confusion'] }),
      makeEntry({ entry_id: '20260316-002', narrative_tags: ['breakthrough'] }),
    ])
    const result = await queryEntries(tmpDir, { tag: 'pivot' })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.entry_id).toBe('20260316-001')
  })

  it('filters by interaction type', async () => {
    await writeLog('2026-03-16', [
      makeEntry({ entry_id: '20260316-001', interaction_type: InteractionType.bug_fixing }),
      makeEntry({ entry_id: '20260316-002', interaction_type: InteractionType.ideation }),
    ])
    const result = await queryEntries(tmpDir, { type: InteractionType.bug_fixing })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.interaction_type).toBe(InteractionType.bug_fixing)
  })

  it('returns empty result when no logs exist', async () => {
    const result = await queryEntries(tmpDir, {})
    expect(result.total).toBe(0)
    expect(result.entries).toEqual([])
    expect(result.dates).toEqual([])
  })

  it('combines multiple filters (AND logic)', async () => {
    await writeLog('2026-03-16', [
      makeEntry({ entry_id: '20260316-001', phase: Phase.design, importance: Importance.high }),
      makeEntry({ entry_id: '20260316-002', phase: Phase.design, importance: Importance.low }),
      makeEntry({ entry_id: '20260316-003', phase: Phase.build, importance: Importance.high }),
    ])
    const result = await queryEntries(tmpDir, { phase: Phase.design, importance: Importance.high })
    expect(result.total).toBe(1)
    expect(result.entries[0]!.entry_id).toBe('20260316-001')
  })
})
