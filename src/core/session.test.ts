import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  openSession,
  closeSession,
  getSessionStatus,
  countEntriesInLog,
  formatSessionSummary,
} from './session.js'
import { scaffoldProjectArchive, readLog } from './storage.js'
import { DEFAULT_CONFIG } from './schema.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'archivist-session-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ─── openSession ─────────────────────────────────────────────────────────────

describe('openSession', () => {
  it('returns a session meta object', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    const meta = await openSession(tmpDir, '2026-03-16')
    expect(meta.session_date).toBe('2026-03-16')
    expect(meta.project_name).toBe('test')
    expect(meta.project_path).toBe(tmpDir)
    expect(meta.entry_count).toBe(0)
    expect(meta.artifacts_count).toBe(0)
    expect(meta.open_loops).toEqual([])
  })

  it('creates the day folder', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    await openSession(tmpDir, '2026-03-16')
    const { access } = await import('fs/promises')
    await expect(
      access(join(tmpDir, 'documentation_notes', 'records', '2026-03-16'))
    ).resolves.toBeUndefined()
  })

  it('writes a session-open entry to the log', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    await openSession(tmpDir, '2026-03-16')
    const log = await readLog(tmpDir, '2026-03-16')
    expect(log).toContain('session_open')
  })

  it('generates a session_id', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    const meta = await openSession(tmpDir, '2026-03-16')
    expect(meta.session_id).toBeTruthy()
    expect(typeof meta.session_id).toBe('string')
  })

  it('sets opened_at to current ISO time', async () => {
    const before = Date.now()
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    const meta = await openSession(tmpDir, '2026-03-16')
    const after = Date.now()
    const openedAt = new Date(meta.opened_at).getTime()
    expect(openedAt).toBeGreaterThanOrEqual(before)
    expect(openedAt).toBeLessThanOrEqual(after)
  })
})

// ─── closeSession ─────────────────────────────────────────────────────────────

describe('closeSession', () => {
  it('writes a session-close entry to the log', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    const meta = await openSession(tmpDir, '2026-03-16')
    await closeSession(tmpDir, '2026-03-16', meta)
    const log = await readLog(tmpDir, '2026-03-16')
    expect(log).toContain('session_close')
  })

  it('returns updated session meta with closed_at', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    const meta = await openSession(tmpDir, '2026-03-16')
    const before = Date.now()
    const closed = await closeSession(tmpDir, '2026-03-16', meta)
    const after = Date.now()
    expect(closed.closed_at).toBeTruthy()
    const closedAt = new Date(closed.closed_at!).getTime()
    expect(closedAt).toBeGreaterThanOrEqual(before)
    expect(closedAt).toBeLessThanOrEqual(after)
  })

  it('includes open_loops in the close entry if any', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    const meta = await openSession(tmpDir, '2026-03-16')
    meta.open_loops = ['Test on real iPhone', 'Verify dark mode contrast']
    await closeSession(tmpDir, '2026-03-16', meta)
    const log = await readLog(tmpDir, '2026-03-16')
    expect(log).toContain('Test on real iPhone')
  })
})

// ─── getSessionStatus ─────────────────────────────────────────────────────────

describe('getSessionStatus', () => {
  it('returns no_config when config does not exist', async () => {
    const status = await getSessionStatus(tmpDir)
    expect(status.state).toBe('no_config')
    expect(status.config).toBeNull()
  })

  it('returns archiving_off when config exists but archiving is false', async () => {
    await scaffoldProjectArchive(tmpDir, {
      ...DEFAULT_CONFIG,
      project_name: 'test',
      archiving: false,
    })
    const status = await getSessionStatus(tmpDir)
    expect(status.state).toBe('archiving_off')
    expect(status.config).not.toBeNull()
  })

  it('returns active when config exists and archiving is true', async () => {
    await scaffoldProjectArchive(tmpDir, {
      ...DEFAULT_CONFIG,
      project_name: 'test',
      archiving: true,
    })
    const status = await getSessionStatus(tmpDir)
    expect(status.state).toBe('active')
    expect(status.config!.project_name).toBe('test')
  })
})

// ─── countEntriesInLog ────────────────────────────────────────────────────────

describe('countEntriesInLog', () => {
  it('returns 0 for an empty or nonexistent log', async () => {
    const count = await countEntriesInLog(tmpDir, '2026-03-16')
    expect(count).toBe(0)
  })

  it('returns 0 after openSession — session events are not counted as entries', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    const meta = await openSession(tmpDir, '2026-03-16')
    // session_open is a session event, not an archival entry — count must be 0
    const count = await countEntriesInLog(tmpDir, '2026-03-16')
    expect(count).toBe(0)
    void meta
  })

  it('counts only Entry separators, not session events', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test', archiving: true })
    const meta = await openSession(tmpDir, '2026-03-16')
    const { buildEntry, writeEntry } = await import('./logger.js')
    const entry = buildEntry({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      objective: 'Test',
      user_prompt: 'Do something',
      assistant_response_summary: 'Done',
    })
    await writeEntry(tmpDir, '2026-03-16', entry)
    const count = await countEntriesInLog(tmpDir, '2026-03-16')
    expect(count).toBe(1) // only the actual entry, not session_open
    void meta
  })
})

// ─── formatSessionSummary ─────────────────────────────────────────────────────

describe('formatSessionSummary', () => {
  it('returns a non-empty string', () => {
    const summary = formatSessionSummary({
      session_id: 'sess-001',
      session_date: '2026-03-16',
      project_name: 'my-portfolio',
      project_path: '/Users/apurvray/my-portfolio',
      opened_at: '2026-03-16T09:00:00Z',
      closed_at: '2026-03-16T11:30:00Z',
      entry_count: 5,
      artifacts_count: 3,
      open_loops: ['Test on real iPhone'],
    })
    expect(typeof summary).toBe('string')
    expect(summary.length).toBeGreaterThan(0)
  })

  it('includes project name', () => {
    const summary = formatSessionSummary({
      session_id: 'sess-001',
      session_date: '2026-03-16',
      project_name: 'my-portfolio',
      project_path: '/Users/apurvray/my-portfolio',
      opened_at: '2026-03-16T09:00:00Z',
      entry_count: 3,
      artifacts_count: 0,
      open_loops: [],
    })
    expect(summary).toContain('my-portfolio')
  })

  it('includes entry count', () => {
    const summary = formatSessionSummary({
      session_id: 'sess-001',
      session_date: '2026-03-16',
      project_name: 'test',
      project_path: '/tmp/test',
      opened_at: '2026-03-16T09:00:00Z',
      entry_count: 7,
      artifacts_count: 2,
      open_loops: [],
    })
    expect(summary).toContain('7')
  })

  it('lists open loops when present', () => {
    const summary = formatSessionSummary({
      session_id: 'sess-001',
      session_date: '2026-03-16',
      project_name: 'test',
      project_path: '/tmp/test',
      opened_at: '2026-03-16T09:00:00Z',
      entry_count: 2,
      artifacts_count: 0,
      open_loops: ['Check Safari on iPhone', 'Verify contrast ratios'],
    })
    expect(summary).toContain('Check Safari on iPhone')
    expect(summary).toContain('Verify contrast ratios')
  })
})
