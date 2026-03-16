import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { generateContent } from './render.js'
import { entryToToon, buildEntry } from '../core/logger.js'
import { InteractionType, Phase, Importance, EntryStatus } from '../core/schema.js'

function makeEntry(overrides: Partial<Parameters<typeof buildEntry>[0]> = {}) {
  return buildEntry({
    entry_id: '20260316-001',
    session_date: '2026-03-16',
    objective: 'Build the header component',
    user_prompt: 'Create a responsive header',
    assistant_response_summary: 'Built responsive header with mobile nav',
    interaction_type: InteractionType.implementation,
    phase: Phase.build,
    importance: Importance.high,
    status: EntryStatus.resolved,
    narrative_tags: ['shipped'],
    ...overrides,
  })
}

describe('generateContent', () => {
  let tmpDir: string

  async function writeLog(date: string, entries: ReturnType<typeof makeEntry>[]) {
    const dir = join(tmpDir, 'documentation_notes', 'records', date)
    await mkdir(dir, { recursive: true })
    const content = entries.map(e => entryToToon(e)).join('\n')
    await writeFile(join(dir, 'daily_log.toon'), content, 'utf-8')
  }

  async function ensureGeneratedDir() {
    await mkdir(join(tmpDir, 'documentation_notes', 'generated_content'), { recursive: true })
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'archivist-render-test-'))
    await ensureGeneratedDir()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('writes a blog file to generated_content/', async () => {
    await writeLog('2026-03-16', [makeEntry()])
    const result = await generateContent({ projectPath: tmpDir, format: 'blog', filter: {} })
    expect(result.entryCount).toBe(1)
    const content = await readFile(result.outputFile, 'utf-8')
    expect(content.length).toBeGreaterThan(100)
    expect(result.outputFile).toContain('generated_content')
    expect(result.outputFile.endsWith('.md')).toBe(true)
  })

  it('writes a case-study file', async () => {
    await writeLog('2026-03-16', [makeEntry()])
    const result = await generateContent({ projectPath: tmpDir, format: 'case-study', filter: {} })
    expect(result.entryCount).toBe(1)
    const content = await readFile(result.outputFile, 'utf-8')
    expect(content.length).toBeGreaterThan(100)
  })

  it('writes a social file', async () => {
    await writeLog('2026-03-16', [makeEntry()])
    const result = await generateContent({ projectPath: tmpDir, format: 'social', filter: {} })
    expect(result.entryCount).toBe(1)
    const content = await readFile(result.outputFile, 'utf-8')
    expect(typeof content).toBe('string')
  })

  it('writes a thread file', async () => {
    await writeLog('2026-03-16', [makeEntry()])
    const result = await generateContent({ projectPath: tmpDir, format: 'thread', filter: {} })
    expect(result.entryCount).toBe(1)
    const content = await readFile(result.outputFile, 'utf-8')
    expect(content).toContain('1/')
  })

  it('filename includes format and date', async () => {
    await writeLog('2026-03-16', [makeEntry()])
    const result = await generateContent({ projectPath: tmpDir, format: 'blog', filter: {} })
    expect(result.outputFile).toContain('blog')
  })

  it('returns 0 entries when no logs match filter', async () => {
    await writeLog('2026-03-16', [makeEntry({ phase: Phase.build })])
    const result = await generateContent({ projectPath: tmpDir, format: 'blog', filter: { phase: Phase.design } })
    expect(result.entryCount).toBe(0)
  })

  it('accepts a custom outputPath', async () => {
    await writeLog('2026-03-16', [makeEntry()])
    const customDir = join(tmpDir, 'custom-output')
    await mkdir(customDir, { recursive: true })
    const result = await generateContent({
      projectPath: tmpDir,
      format: 'blog',
      filter: {},
      outputPath: customDir,
    })
    expect(result.outputFile).toContain(customDir)
  })
})
