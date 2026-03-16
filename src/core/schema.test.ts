import { describe, it, expect } from 'vitest'
import {
  type ArchiveEntry,
  type ArchivistConfig,
  type SessionMeta,
  InteractionType,
  Phase,
  Importance,
  EntryStatus,
  ProjectPhase,
  validateEntry,
  validateConfig,
  createEmptyEntry,
  getDefaultConfig,
  ARCHIVE_ROOT,
} from './schema.js'

describe('InteractionType enum', () => {
  it('contains all expected values', () => {
    expect(InteractionType.ideation).toBe('ideation')
    expect(InteractionType.exploration).toBe('exploration')
    expect(InteractionType.refinement).toBe('refinement')
    expect(InteractionType.bug_fixing).toBe('bug_fixing')
    expect(InteractionType.implementation).toBe('implementation')
    expect(InteractionType.review).toBe('review')
    expect(InteractionType.validation).toBe('validation')
    expect(InteractionType.content_generation).toBe('content_generation')
  })
})

describe('Phase enum', () => {
  it('contains all expected values', () => {
    expect(Phase.discovery).toBe('discovery')
    expect(Phase.concepting).toBe('concepting')
    expect(Phase.design).toBe('design')
    expect(Phase.build).toBe('build')
    expect(Phase.testing).toBe('testing')
    expect(Phase.polish).toBe('polish')
    expect(Phase.shipping).toBe('shipping')
    expect(Phase.reflection).toBe('reflection')
  })
})

describe('ARCHIVE_ROOT', () => {
  it('equals documentation_notes', () => {
    expect(ARCHIVE_ROOT).toBe('documentation_notes')
  })
})

describe('getDefaultConfig', () => {
  it('returns a fresh object each time', () => {
    const a = getDefaultConfig()
    const b = getDefaultConfig()
    expect(a).not.toBe(b)
    expect(a.capture).not.toBe(b.capture)
    expect(a.capture.devserver_ports).not.toBe(b.capture.devserver_ports)
  })

  it('returns a valid config', () => {
    expect(validateConfig(getDefaultConfig())).toBe(true)
  })
})

describe('validateEntry', () => {
  it('returns true for a valid minimal entry', () => {
    const entry: ArchiveEntry = {
      entry_id: '20260316-001',
      timestamp: '2026-03-16T10:00:00Z',
      session_date: '2026-03-16',
      interaction_type: InteractionType.ideation,
      phase: Phase.concepting,
      importance: Importance.medium,
      status: EntryStatus.in_progress,
      objective: 'Test the schema',
      interaction: {
        user_prompt: 'Do something',
        assistant_response_summary: 'Did something',
        assistant_actions: [],
      },
      tooling: {
        tools_used: [],
        mcps_used: [],
        files_touched: [],
      },
      context: {},
      story: {},
      decisions: {
        decisions_made: [],
        prompts_of_note: [],
      },
      failures: {},
      artifacts: {
        visual_capture_refs: [],
        artifact_refs: [],
      },
      resolution: {
        outcome: '',
        next_open_loop: '',
      },
      tags: {
        narrative_tags: [],
      },
    }
    expect(validateEntry(entry)).toBe(true)
  })

  it('returns false when entry_id is missing', () => {
    const entry = { timestamp: '2026-03-16T10:00:00Z' } as unknown as ArchiveEntry
    expect(validateEntry(entry)).toBe(false)
  })

  it('returns false when timestamp is missing', () => {
    const entry = { entry_id: '20260316-001' } as unknown as ArchiveEntry
    expect(validateEntry(entry)).toBe(false)
  })

  it('returns false when objective is missing', () => {
    const entry = {
      entry_id: '20260316-001',
      timestamp: '2026-03-16T10:00:00Z',
    } as unknown as ArchiveEntry
    expect(validateEntry(entry)).toBe(false)
  })

  it('returns false when interaction sub-object is missing', () => {
    const entry = {
      entry_id: '20260316-001',
      timestamp: '2026-03-16T10:00:00Z',
      session_date: '2026-03-16',
      objective: 'Test',
      // interaction missing
      tooling: {},
      resolution: {},
      artifacts: {},
    } as unknown as ArchiveEntry
    expect(validateEntry(entry)).toBe(false)
  })

  it('returns false when tooling sub-object is missing', () => {
    const entry = {
      entry_id: '20260316-001',
      timestamp: '2026-03-16T10:00:00Z',
      session_date: '2026-03-16',
      objective: 'Test',
      interaction: {},
      // tooling missing
      resolution: {},
      artifacts: {},
    } as unknown as ArchiveEntry
    expect(validateEntry(entry)).toBe(false)
  })

  it('returns false when resolution sub-object is missing', () => {
    const entry = {
      entry_id: '20260316-001',
      timestamp: '2026-03-16T10:00:00Z',
      session_date: '2026-03-16',
      objective: 'Test',
      interaction: {},
      tooling: {},
      // resolution missing
      artifacts: {},
    } as unknown as ArchiveEntry
    expect(validateEntry(entry)).toBe(false)
  })
})

describe('validateConfig', () => {
  it('returns true for a valid config', () => {
    const config: ArchivistConfig = {
      project_name: 'my-project',
      archiving: true,
      archive_path: 'documentation_notes',
      pause_threshold: 5,
      phase: ProjectPhase.design,
      capture: {
        devserver_ports: [3000, 5173],
        figma_mcp: false,
        paper_mcp: false,
        breakpoints: [375, 768, 1280],
      },
    }
    expect(validateConfig(config)).toBe(true)
  })

  it('returns false when project_name is missing', () => {
    const config = { archiving: true } as unknown as ArchivistConfig
    expect(validateConfig(config)).toBe(false)
  })

  it('returns false when pause_threshold is not a positive number', () => {
    const config = { ...getDefaultConfig(), pause_threshold: -1 }
    expect(validateConfig(config)).toBe(false)
  })

  it('returns false when archive_path is missing', () => {
    const config = { ...getDefaultConfig(), archive_path: undefined } as unknown as ArchivistConfig
    expect(validateConfig(config)).toBe(false)
  })

  it('returns false when phase is an unknown value', () => {
    const config = { ...getDefaultConfig(), phase: 'not-a-phase' } as unknown as ArchivistConfig
    expect(validateConfig(config)).toBe(false)
  })

  it('returns false when capture sub-object is missing', () => {
    const config = { ...getDefaultConfig(), capture: undefined } as unknown as ArchivistConfig
    expect(validateConfig(config)).toBe(false)
  })

  it('returns false when capture.devserver_ports is not an array', () => {
    const config = {
      ...getDefaultConfig(),
      capture: { ...getDefaultConfig().capture, devserver_ports: 3000 },
    } as unknown as ArchivistConfig
    expect(validateConfig(config)).toBe(false)
  })

  it('returns false when capture.figma_mcp is not a boolean', () => {
    const config = {
      ...getDefaultConfig(),
      capture: { ...getDefaultConfig().capture, figma_mcp: 'yes' },
    } as unknown as ArchivistConfig
    expect(validateConfig(config)).toBe(false)
  })
})

describe('createEmptyEntry', () => {
  it('creates an entry with required fields populated', () => {
    const entry = createEmptyEntry('20260316-001', '2026-03-16', 'Test objective')
    expect(entry.entry_id).toBe('20260316-001')
    expect(entry.session_date).toBe('2026-03-16')
    expect(entry.objective).toBe('Test objective')
    expect(entry.timestamp).toBeTruthy()
    expect(entry.interaction.assistant_actions).toEqual([])
    expect(entry.tooling.tools_used).toEqual([])
    expect(entry.artifacts.visual_capture_refs).toEqual([])
    expect(entry.tags.narrative_tags).toEqual([])
  })

  it('sets default values for optional fields', () => {
    const entry = createEmptyEntry('20260316-002', '2026-03-16', 'Another objective')
    expect(entry.importance).toBe(Importance.medium)
    expect(entry.status).toBe(EntryStatus.in_progress)
    expect(entry.phase).toBe(Phase.build)
    expect(entry.interaction_type).toBe(InteractionType.implementation)
  })
})

describe('SessionMeta type', () => {
  it('accepts a valid session meta object', () => {
    const meta: SessionMeta = {
      session_id: 'sess-001',
      session_date: '2026-03-16',
      project_name: 'my-project',
      project_path: '/home/user/my-project',
      opened_at: '2026-03-16T09:00:00Z',
      entry_count: 0,
      artifacts_count: 0,
      open_loops: [],
    }
    expect(meta.session_id).toBe('sess-001')
    expect(meta.entry_count).toBe(0)
  })
})
