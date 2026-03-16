import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildEntry, writeEntry, nextEntryId, entryToToon } from './logger.js'
import { scaffoldProjectArchive, ensureDayFolder, readLog } from './storage.js'
import { DEFAULT_CONFIG, InteractionType, Phase, Importance, EntryStatus } from './schema.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'archivist-logger-test-'))
  await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
  await ensureDayFolder(tmpDir, '2026-03-16')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── nextEntryId ──────────────────────────────────────────────────────────────

describe('nextEntryId', () => {
  it('returns 001 for a new day', () => {
    const id = nextEntryId('2026-03-16', 0)
    expect(id).toBe('20260316-001')
  })

  it('increments based on existing count', () => {
    const id = nextEntryId('2026-03-16', 4)
    expect(id).toBe('20260316-005')
  })

  it('zero-pads to 3 digits', () => {
    const id = nextEntryId('2026-03-16', 9)
    expect(id).toBe('20260316-010')
  })
})

// ─── buildEntry ───────────────────────────────────────────────────────────────

describe('buildEntry', () => {
  it('creates an entry with required fields', () => {
    const entry = buildEntry({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      objective: 'Fix the blur bug',
      user_prompt: 'Add -webkit- prefix and test',
      assistant_response_summary: 'Added prefix, tested at 3 breakpoints',
    })
    expect(entry.entry_id).toBe('20260316-001')
    expect(entry.session_date).toBe('2026-03-16')
    expect(entry.objective).toBe('Fix the blur bug')
    expect(entry.interaction.user_prompt).toBe('Add -webkit- prefix and test')
    expect(entry.interaction.assistant_response_summary).toBe('Added prefix, tested at 3 breakpoints')
  })

  it('applies optional fields when provided', () => {
    const entry = buildEntry({
      entry_id: '20260316-002',
      session_date: '2026-03-16',
      objective: 'Design hero section',
      user_prompt: 'Create a glassmorphism hero',
      assistant_response_summary: 'Created hero with frosted glass effect',
      interaction_type: InteractionType.refinement,
      phase: Phase.design,
      importance: Importance.high,
      status: EntryStatus.resolved,
      tools_used: ['Edit', 'Bash'],
      files_touched: ['src/Hero.tsx'],
      narrative_tags: ['breakthrough', 'iteration'],
      voiceover_note: 'This was the moment the layout clicked.',
      storytelling_context: 'Two hours of iteration led here.',
      decisions_made: ['Use backdrop-filter over box-shadow'],
    })
    expect(entry.interaction_type).toBe('refinement')
    expect(entry.phase).toBe('design')
    expect(entry.importance).toBe('high')
    expect(entry.status).toBe('resolved')
    expect(entry.tooling.tools_used).toEqual(['Edit', 'Bash'])
    expect(entry.tooling.files_touched).toEqual(['src/Hero.tsx'])
    expect(entry.tags.narrative_tags).toEqual(['breakthrough', 'iteration'])
    expect(entry.story.voiceover_note).toBe('This was the moment the layout clicked.')
    expect(entry.story.storytelling_context).toBe('Two hours of iteration led here.')
    expect(entry.decisions.decisions_made).toEqual(['Use backdrop-filter over box-shadow'])
  })

  it('sets timestamp to current time', () => {
    const before = Date.now()
    const entry = buildEntry({
      entry_id: '20260316-003',
      session_date: '2026-03-16',
      objective: 'Test timestamp',
      user_prompt: 'Do something',
      assistant_response_summary: 'Done',
    })
    const after = Date.now()
    const entryTime = new Date(entry.timestamp).getTime()
    expect(entryTime).toBeGreaterThanOrEqual(before)
    expect(entryTime).toBeLessThanOrEqual(after)
  })

  it('defaults to empty arrays for list fields', () => {
    const entry = buildEntry({
      entry_id: '20260316-004',
      session_date: '2026-03-16',
      objective: 'Defaults test',
      user_prompt: 'Do something',
      assistant_response_summary: 'Done',
    })
    expect(entry.tooling.tools_used).toEqual([])
    expect(entry.tooling.mcps_used).toEqual([])
    expect(entry.tooling.files_touched).toEqual([])
    expect(entry.tags.narrative_tags).toEqual([])
    expect(entry.artifacts.visual_capture_refs).toEqual([])
    expect(entry.artifacts.artifact_refs).toEqual([])
    expect(entry.decisions.decisions_made).toEqual([])
    expect(entry.decisions.prompts_of_note).toEqual([])
    expect(entry.interaction.assistant_actions).toEqual([])
  })
})

// ─── entryToToon ─────────────────────────────────────────────────────────────

describe('entryToToon', () => {
  it('produces a non-empty string', () => {
    const entry = buildEntry({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      objective: 'Test serialization',
      user_prompt: 'Serialize this',
      assistant_response_summary: 'Serialized',
    })
    const toon = entryToToon(entry)
    expect(typeof toon).toBe('string')
    expect(toon.length).toBeGreaterThan(0)
  })

  it('includes entry_id in output', () => {
    const entry = buildEntry({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      objective: 'Test',
      user_prompt: 'Test',
      assistant_response_summary: 'Test',
    })
    const toon = entryToToon(entry)
    expect(toon).toContain('20260316-001')
  })

  it('includes objective in output', () => {
    const entry = buildEntry({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      objective: 'Fix the glassmorphism blur',
      user_prompt: 'Test',
      assistant_response_summary: 'Test',
    })
    const toon = entryToToon(entry)
    expect(toon).toContain('Fix the glassmorphism blur')
  })

  it('includes a section separator comment', () => {
    const entry = buildEntry({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      objective: 'Test',
      user_prompt: 'Test',
      assistant_response_summary: 'Test',
    })
    const toon = entryToToon(entry)
    expect(toon).toContain('# ─── Entry')
  })
})

// ─── writeEntry ───────────────────────────────────────────────────────────────

describe('writeEntry', () => {
  it('writes an entry to the daily log', async () => {
    const entry = buildEntry({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      objective: 'Write to log',
      user_prompt: 'Archive this',
      assistant_response_summary: 'Archived',
    })
    await writeEntry(tmpDir, '2026-03-16', entry)
    const log = await readLog(tmpDir, '2026-03-16')
    expect(log).toContain('20260316-001')
    expect(log).toContain('Write to log')
  })

  it('appends multiple entries to the same log', async () => {
    for (let i = 1; i <= 3; i++) {
      const entry = buildEntry({
        entry_id: `20260316-00${i}`,
        session_date: '2026-03-16',
        objective: `Objective ${i}`,
        user_prompt: `Prompt ${i}`,
        assistant_response_summary: `Response ${i}`,
      })
      await writeEntry(tmpDir, '2026-03-16', entry)
    }
    const log = await readLog(tmpDir, '2026-03-16')
    expect(log).toContain('20260316-001')
    expect(log).toContain('20260316-002')
    expect(log).toContain('20260316-003')
  })
})
