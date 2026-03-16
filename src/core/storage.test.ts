import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  scaffoldProjectArchive,
  ensureDayFolder,
  readConfig,
  writeConfig,
  appendToLog,
  readLog,
  getDayFolderPath,
  getLogPath,
  getArtifactsPath,
  configExists,
} from './storage.js'
import { DEFAULT_CONFIG, type ArchivistConfig } from './schema.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'archivist-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── Path helpers ─────────────────────────────────────────────────────────────

describe('getDayFolderPath', () => {
  it('returns correct path for a given date', () => {
    const result = getDayFolderPath(tmpDir, '2026-03-16')
    expect(result).toBe(join(tmpDir, 'documentation_notes', 'records', '2026-03-16'))
  })
})

describe('getLogPath', () => {
  it('returns correct daily log path', () => {
    const result = getLogPath(tmpDir, '2026-03-16')
    expect(result).toBe(
      join(tmpDir, 'documentation_notes', 'records', '2026-03-16', 'daily_log.toon')
    )
  })
})

describe('getArtifactsPath', () => {
  it('returns correct artifacts path', () => {
    const result = getArtifactsPath(tmpDir, '2026-03-16')
    expect(result).toBe(
      join(tmpDir, 'documentation_notes', 'records', '2026-03-16', 'artifacts')
    )
  })
})

// ─── configExists ─────────────────────────────────────────────────────────────

describe('configExists', () => {
  it('returns false when no config exists', async () => {
    const result = await configExists(tmpDir)
    expect(result).toBe(false)
  })

  it('returns true after scaffolding', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    const result = await configExists(tmpDir)
    expect(result).toBe(true)
  })
})

// ─── scaffoldProjectArchive ───────────────────────────────────────────────────

describe('scaffoldProjectArchive', () => {
  it('creates documentation_notes directory', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    const { access } = await import('fs/promises')
    await expect(access(join(tmpDir, 'documentation_notes'))).resolves.toBeUndefined()
  })

  it('creates records directory', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    const { access } = await import('fs/promises')
    await expect(
      access(join(tmpDir, 'documentation_notes', 'records'))
    ).resolves.toBeUndefined()
  })

  it('creates generated_content directory', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    const { access } = await import('fs/promises')
    await expect(
      access(join(tmpDir, 'documentation_notes', 'generated_content'))
    ).resolves.toBeUndefined()
  })

  it('writes archivist.config.toon', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'my-project' })
    const config = await readConfig(tmpDir)
    expect(config).not.toBeNull()
    expect(config!.project_name).toBe('my-project')
  })

  it('appends documentation_notes to .gitignore if it exists', async () => {
    const { writeFile, readFile } = await import('fs/promises')
    await writeFile(join(tmpDir, '.gitignore'), 'node_modules\n')
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    const content = await readFile(join(tmpDir, '.gitignore'), 'utf-8')
    expect(content).toContain('documentation_notes')
  })

  it('does not duplicate gitignore entry if already present', async () => {
    const { writeFile, readFile } = await import('fs/promises')
    await writeFile(join(tmpDir, '.gitignore'), 'node_modules\ndocumentation_notes\n')
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    const content = await readFile(join(tmpDir, '.gitignore'), 'utf-8')
    const occurrences = (content.match(/documentation_notes/g) ?? []).length
    expect(occurrences).toBe(1)
  })

  it('is idempotent — safe to call twice', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    const config = await readConfig(tmpDir)
    expect(config).not.toBeNull()
  })
})

// ─── ensureDayFolder ──────────────────────────────────────────────────────────

describe('ensureDayFolder', () => {
  it('creates the day folder', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    await ensureDayFolder(tmpDir, '2026-03-16')
    const { access } = await import('fs/promises')
    await expect(
      access(join(tmpDir, 'documentation_notes', 'records', '2026-03-16'))
    ).resolves.toBeUndefined()
  })

  it('creates the artifacts subfolder', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    await ensureDayFolder(tmpDir, '2026-03-16')
    const { access } = await import('fs/promises')
    await expect(
      access(join(tmpDir, 'documentation_notes', 'records', '2026-03-16', 'artifacts'))
    ).resolves.toBeUndefined()
  })

  it('is idempotent', async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    await ensureDayFolder(tmpDir, '2026-03-16')
    await ensureDayFolder(tmpDir, '2026-03-16')
    const { access } = await import('fs/promises')
    await expect(
      access(join(tmpDir, 'documentation_notes', 'records', '2026-03-16'))
    ).resolves.toBeUndefined()
  })
})

// ─── readConfig / writeConfig ─────────────────────────────────────────────────

describe('readConfig / writeConfig', () => {
  it('returns null when no config exists', async () => {
    const config = await readConfig(tmpDir)
    expect(config).toBeNull()
  })

  it('round-trips a config object', async () => {
    const original: ArchivistConfig = {
      ...DEFAULT_CONFIG,
      project_name: 'round-trip-test',
      archiving: true,
      pause_threshold: 3,
    }
    await writeConfig(tmpDir, original)
    const read = await readConfig(tmpDir)
    expect(read).not.toBeNull()
    expect(read!.project_name).toBe('round-trip-test')
    expect(read!.archiving).toBe(true)
    expect(read!.pause_threshold).toBe(3)
  })

  it('overwrites existing config', async () => {
    await writeConfig(tmpDir, { ...DEFAULT_CONFIG, project_name: 'first' })
    await writeConfig(tmpDir, { ...DEFAULT_CONFIG, project_name: 'second' })
    const config = await readConfig(tmpDir)
    expect(config!.project_name).toBe('second')
  })
})

// ─── appendToLog / readLog ────────────────────────────────────────────────────

describe('appendToLog / readLog', () => {
  beforeEach(async () => {
    await scaffoldProjectArchive(tmpDir, { ...DEFAULT_CONFIG, project_name: 'test' })
    await ensureDayFolder(tmpDir, '2026-03-16')
  })

  it('returns empty string when log does not exist', async () => {
    const content = await readLog(tmpDir, '2026-03-17')
    expect(content).toBe('')
  })

  it('appends content to the log', async () => {
    await appendToLog(tmpDir, '2026-03-16', 'entry_id: 20260316-001')
    const content = await readLog(tmpDir, '2026-03-16')
    expect(content).toContain('entry_id: 20260316-001')
  })

  it('separates multiple entries with a newline', async () => {
    await appendToLog(tmpDir, '2026-03-16', 'entry_id: 20260316-001')
    await appendToLog(tmpDir, '2026-03-16', 'entry_id: 20260316-002')
    const content = await readLog(tmpDir, '2026-03-16')
    expect(content).toContain('entry_id: 20260316-001')
    expect(content).toContain('entry_id: 20260316-002')
    expect(content).toContain('\n')
  })

  it('accumulates entries across multiple appends', async () => {
    for (let i = 1; i <= 5; i++) {
      await appendToLog(tmpDir, '2026-03-16', `entry_id: 20260316-00${i}`)
    }
    const content = await readLog(tmpDir, '2026-03-16')
    for (let i = 1; i <= 5; i++) {
      expect(content).toContain(`entry_id: 20260316-00${i}`)
    }
  })
})
