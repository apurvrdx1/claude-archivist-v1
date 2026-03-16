import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  readState,
  writeState,
  incrementToolCount,
  resetToolCount,
  markGreeted,
  markDeclined,
} from './state.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'archivist-state-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('readState', () => {
  it('returns default state when no file exists', async () => {
    const state = await readState(tmpDir)
    expect(state.greeted_today).toBe(false)
    expect(state.tool_calls_since_archive).toBe(0)
    expect(state.declined_today).toBe(false)
    expect(state.last_archive_prompt_at).toBeNull()
  })

  it('returns default state with today as session_date', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const state = await readState(tmpDir)
    expect(state.session_date).toBe(today)
  })

  it('resets state if stored date is stale', async () => {
    const staleState = {
      session_date: '2020-01-01',
      greeted_today: true,
      tool_calls_since_archive: 10,
      last_archive_prompt_at: '2020-01-01T10:00:00Z',
      declined_today: true,
    }
    await writeState(tmpDir, staleState)
    const state = await readState(tmpDir)
    const today = new Date().toISOString().slice(0, 10)
    expect(state.session_date).toBe(today)
    expect(state.greeted_today).toBe(false)
    expect(state.tool_calls_since_archive).toBe(0)
    expect(state.declined_today).toBe(false)
  })
})

describe('writeState / readState round-trip', () => {
  it('persists and reads back state correctly', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await writeState(tmpDir, {
      session_date: today,
      greeted_today: true,
      tool_calls_since_archive: 3,
      last_archive_prompt_at: '2026-03-16T10:00:00Z',
      declined_today: false,
    })
    const state = await readState(tmpDir)
    expect(state.greeted_today).toBe(true)
    expect(state.tool_calls_since_archive).toBe(3)
    expect(state.last_archive_prompt_at).toBe('2026-03-16T10:00:00Z')
  })
})

describe('incrementToolCount', () => {
  it('increments count from 0 to 1', async () => {
    const state = await incrementToolCount(tmpDir)
    expect(state.tool_calls_since_archive).toBe(1)
  })

  it('increments count across multiple calls', async () => {
    await incrementToolCount(tmpDir)
    await incrementToolCount(tmpDir)
    const state = await incrementToolCount(tmpDir)
    expect(state.tool_calls_since_archive).toBe(3)
  })
})

describe('resetToolCount', () => {
  it('resets tool count to 0', async () => {
    await incrementToolCount(tmpDir)
    await incrementToolCount(tmpDir)
    await resetToolCount(tmpDir)
    const state = await readState(tmpDir)
    expect(state.tool_calls_since_archive).toBe(0)
  })

  it('sets last_archive_prompt_at to current time', async () => {
    const before = Date.now()
    await resetToolCount(tmpDir)
    const after = Date.now()
    const state = await readState(tmpDir)
    const promptTime = new Date(state.last_archive_prompt_at!).getTime()
    expect(promptTime).toBeGreaterThanOrEqual(before)
    expect(promptTime).toBeLessThanOrEqual(after)
  })
})

describe('markGreeted', () => {
  it('sets greeted_today to true', async () => {
    await markGreeted(tmpDir)
    const state = await readState(tmpDir)
    expect(state.greeted_today).toBe(true)
  })
})

describe('markDeclined', () => {
  it('sets declined_today to true', async () => {
    await markDeclined(tmpDir)
    const state = await readState(tmpDir)
    expect(state.declined_today).toBe(true)
  })
})
