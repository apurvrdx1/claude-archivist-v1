import { describe, it, expect } from 'vitest'
import { renderBlog, renderCaseStudy, renderSocial, renderThread } from './templates.js'
import { buildEntry } from '../core/logger.js'
import { InteractionType, Phase, Importance, EntryStatus } from '../core/schema.js'
import type { ArchiveEntry } from '../core/schema.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<Parameters<typeof buildEntry>[0]> = {}): ArchiveEntry {
  return buildEntry({
    entry_id: '20260316-001',
    session_date: '2026-03-16',
    objective: 'Build the hero layout',
    user_prompt: 'Make the hero section responsive',
    assistant_response_summary: 'Implemented responsive hero with CSS grid',
    interaction_type: InteractionType.implementation,
    phase: Phase.build,
    importance: Importance.high,
    status: EntryStatus.resolved,
    narrative_tags: ['breakthrough'],
    ...overrides,
  })
}

const PROJECT_NAME = 'My Test Project'

// ─── renderBlog ───────────────────────────────────────────────────────────────

describe('renderBlog', () => {
  it('produces a non-empty markdown document', () => {
    const entries = [makeEntry()]
    const output = renderBlog(entries, PROJECT_NAME)
    expect(output.length).toBeGreaterThan(100)
  })

  it('includes the project name in the title', () => {
    const entries = [makeEntry()]
    const output = renderBlog(entries, PROJECT_NAME)
    expect(output).toContain(PROJECT_NAME)
  })

  it('includes each entry objective', () => {
    const entries = [
      makeEntry({ entry_id: '20260316-001', objective: 'First goal' }),
      makeEntry({ entry_id: '20260316-002', objective: 'Second goal' }),
    ]
    const output = renderBlog(entries, PROJECT_NAME)
    expect(output).toContain('First goal')
    expect(output).toContain('Second goal')
  })

  it('includes voiceover notes verbatim', () => {
    const entries = [makeEntry({ voiceover_note: 'This was the moment everything clicked.' })]
    const output = renderBlog(entries, PROJECT_NAME)
    expect(output).toContain('This was the moment everything clicked.')
  })

  it('includes failures if present', () => {
    const entries = [makeEntry({ errors_or_failures: 'CSS grid gap was ignored in Safari' })]
    const output = renderBlog(entries, PROJECT_NAME)
    expect(output).toContain('CSS grid gap was ignored in Safari')
  })

  it('handles empty entry list gracefully', () => {
    const output = renderBlog([], PROJECT_NAME)
    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })

  it('includes generated-by footer', () => {
    const output = renderBlog([makeEntry()], PROJECT_NAME)
    expect(output).toContain('claude-archivist')
  })
})

// ─── renderCaseStudy ──────────────────────────────────────────────────────────

describe('renderCaseStudy', () => {
  it('produces a non-empty markdown document', () => {
    const entries = [makeEntry()]
    const output = renderCaseStudy(entries, PROJECT_NAME)
    expect(output.length).toBeGreaterThan(100)
  })

  it('includes project name', () => {
    const output = renderCaseStudy([makeEntry()], PROJECT_NAME)
    expect(output).toContain(PROJECT_NAME)
  })

  it('includes a section for key decisions', () => {
    const entries = [makeEntry({ decisions_made: ['Chose CSS grid over flexbox', 'Dropped IE11 support'] })]
    const output = renderCaseStudy(entries, PROJECT_NAME)
    expect(output).toContain('Chose CSS grid over flexbox')
  })

  it('includes failures and recovery section when failures exist', () => {
    const entries = [makeEntry({ errors_or_failures: 'Grid broke on Firefox 89' })]
    const output = renderCaseStudy(entries, PROJECT_NAME)
    expect(output).toContain('Grid broke on Firefox 89')
  })

  it('includes high/critical importance entries prominently', () => {
    const entries = [
      makeEntry({ entry_id: '001', importance: Importance.critical, objective: 'Critical breakthrough' }),
      makeEntry({ entry_id: '002', importance: Importance.low, objective: 'Minor cleanup' }),
    ]
    const output = renderCaseStudy(entries, PROJECT_NAME)
    expect(output).toContain('Critical breakthrough')
  })
})

// ─── renderSocial ─────────────────────────────────────────────────────────────

describe('renderSocial', () => {
  it('produces a short output', () => {
    const entries = [makeEntry()]
    const output = renderSocial(entries, PROJECT_NAME)
    // Social posts should be concise — under 500 chars of actual content
    expect(output.length).toBeLessThan(1000)
  })

  it('includes the project name or key objective', () => {
    const entries = [makeEntry({ objective: 'Got the hero layout working' })]
    const output = renderSocial(entries, PROJECT_NAME)
    // Should mention either the project or the key moment
    expect(output.toLowerCase()).toMatch(/my test project|hero layout/i)
  })

  it('uses voiceover note as the lead when available', () => {
    const entries = [makeEntry({ voiceover_note: 'Sometimes the simple fix is the right fix.' })]
    const output = renderSocial(entries, PROJECT_NAME)
    expect(output).toContain('Sometimes the simple fix is the right fix.')
  })

  it('handles empty entries without crashing', () => {
    const output = renderSocial([], PROJECT_NAME)
    expect(typeof output).toBe('string')
  })
})

// ─── renderThread ─────────────────────────────────────────────────────────────

describe('renderThread', () => {
  it('produces numbered posts', () => {
    const entries = [
      makeEntry({ entry_id: '001', objective: 'First step' }),
      makeEntry({ entry_id: '002', objective: 'Second step' }),
      makeEntry({ entry_id: '003', objective: 'Third step' }),
    ]
    const output = renderThread(entries, PROJECT_NAME)
    expect(output).toContain('1/')
    expect(output).toContain('2/')
  })

  it('first post introduces the project', () => {
    const entries = [makeEntry()]
    const output = renderThread(entries, PROJECT_NAME)
    const firstPost = output.split('\n\n')[0]
    expect(firstPost).toContain(PROJECT_NAME)
  })

  it('includes voiceover notes in thread posts', () => {
    const entries = [makeEntry({ voiceover_note: 'The turning point was unexpected.' })]
    const output = renderThread(entries, PROJECT_NAME)
    expect(output).toContain('The turning point was unexpected.')
  })

  it('handles single entry', () => {
    const output = renderThread([makeEntry()], PROJECT_NAME)
    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })
})
