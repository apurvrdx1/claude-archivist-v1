import { describe, it, expect } from 'vitest'
import { encodeToon, decodeToon } from './toon.js'

// ─── Primitive encoding ───────────────────────────────────────────────────────

describe('encodeToon - primitives', () => {
  it('encodes a simple string value', () => {
    const result = encodeToon({ name: 'Alice' })
    expect(result).toBe('name: Alice')
  })

  it('encodes a number value', () => {
    const result = encodeToon({ count: 42 })
    expect(result).toBe('count: 42')
  })

  it('encodes a boolean true', () => {
    const result = encodeToon({ active: true })
    expect(result).toBe('active: true')
  })

  it('encodes a boolean false', () => {
    const result = encodeToon({ active: false })
    expect(result).toBe('active: false')
  })

  it('quotes a string that contains a colon', () => {
    const result = encodeToon({ url: 'http://localhost:3000' })
    expect(result).toBe('url: "http://localhost:3000"')
  })

  it('quotes a string that is empty', () => {
    const result = encodeToon({ label: '' })
    expect(result).toBe('label: ""')
  })

  it('quotes a string that looks like a number', () => {
    const result = encodeToon({ version: '3.0' })
    expect(result).toBe('version: "3.0"')
  })

  it('quotes a string equal to true', () => {
    const result = encodeToon({ flag: 'true' })
    expect(result).toBe('flag: "true"')
  })

  it('quotes a string equal to false', () => {
    const result = encodeToon({ flag: 'false' })
    expect(result).toBe('flag: "false"')
  })

  it('quotes a string equal to null', () => {
    const result = encodeToon({ val: 'null' })
    expect(result).toBe('val: "null"')
  })

  it('quotes a string with leading whitespace', () => {
    const result = encodeToon({ note: ' leading space' })
    expect(result).toBe('note: " leading space"')
  })

  it('quotes a string with trailing whitespace', () => {
    const result = encodeToon({ note: 'trailing space ' })
    expect(result).toBe('note: "trailing space "')
  })

  it('encodes null as null', () => {
    const result = encodeToon({ val: null })
    expect(result).toBe('val: null')
  })

  it('escapes backslashes in quoted strings', () => {
    const result = encodeToon({ path: 'C:\\Users\\Alice' })
    expect(result).toBe('path: "C:\\\\Users\\\\Alice"')
  })

  it('escapes newlines in quoted strings', () => {
    const result = encodeToon({ text: 'line1\nline2' })
    expect(result).toBe('text: "line1\\nline2"')
  })
})

// ─── Multiline strings ────────────────────────────────────────────────────────

describe('encodeToon - multiline strings', () => {
  it('uses block scalar for long strings with newlines', () => {
    const longText = 'This is a long narrative note.\nIt spans multiple lines.\nVery important story context.'
    const result = encodeToon({ voiceover_note: longText })
    expect(result).toContain('voiceover_note: |')
    expect(result).toContain('  This is a long narrative note.')
    expect(result).toContain('  It spans multiple lines.')
  })
})

// ─── Arrays ───────────────────────────────────────────────────────────────────

describe('encodeToon - arrays', () => {
  it('encodes an empty array', () => {
    const result = encodeToon({ items: [] })
    expect(result).toBe('items[0]:')
  })

  it('encodes a primitive array inline', () => {
    const result = encodeToon({ tags: ['admin', 'ops', 'dev'] })
    expect(result).toBe('tags[3]: admin,ops,dev')
  })

  it('encodes an array of numbers inline', () => {
    const result = encodeToon({ ports: [3000, 5173, 8080] })
    expect(result).toBe('ports[3]: 3000,5173,8080')
  })

  it('quotes array values that contain commas', () => {
    const result = encodeToon({ notes: ['hello, world', 'foo'] })
    expect(result).toBe('notes[2]: "hello, world",foo')
  })

  it('quotes array values that contain colons', () => {
    const result = encodeToon({ actions: ['Modified Hero.tsx:42', 'Added prefix'] })
    expect(result).toBe('actions[2]: "Modified Hero.tsx:42",Added prefix')
  })
})

// ─── Nested objects ───────────────────────────────────────────────────────────

describe('encodeToon - nested objects', () => {
  it('encodes a nested object with 2-space indent', () => {
    const result = encodeToon({
      interaction: {
        user_prompt: 'Fix the bug',
        assistant_response_summary: 'Fixed it',
      },
    })
    expect(result).toContain('interaction:')
    expect(result).toContain('  user_prompt: Fix the bug')
    expect(result).toContain('  assistant_response_summary: Fixed it')
  })

  it('encodes deeply nested objects', () => {
    const result = encodeToon({
      capture: {
        figma_mcp: true,
        paper_mcp: false,
      },
    })
    expect(result).toContain('capture:')
    expect(result).toContain('  figma_mcp: true')
    expect(result).toContain('  paper_mcp: false')
  })
})

// ─── Full entry round-trip ────────────────────────────────────────────────────

describe('encodeToon - multi-field objects', () => {
  it('encodes multiple top-level fields', () => {
    const result = encodeToon({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      importance: 'high',
    })
    expect(result).toContain('entry_id: 20260316-001')
    expect(result).toContain('session_date: 2026-03-16')
    expect(result).toContain('importance: high')
  })
})

// ─── decodeToon ──────────────────────────────────────────────────────────────

describe('decodeToon', () => {
  it('decodes a simple key-value pair', () => {
    const result = decodeToon('name: Alice')
    expect(result).toEqual({ name: 'Alice' })
  })

  it('decodes a number value', () => {
    const result = decodeToon('count: 42')
    expect(result).toEqual({ count: 42 })
  })

  it('decodes a boolean true', () => {
    const result = decodeToon('active: true')
    expect(result).toEqual({ active: true })
  })

  it('decodes a boolean false', () => {
    const result = decodeToon('active: false')
    expect(result).toEqual({ active: false })
  })

  it('decodes null', () => {
    const result = decodeToon('val: null')
    expect(result).toEqual({ val: null })
  })

  it('decodes a quoted string', () => {
    const result = decodeToon('url: "http://localhost:3000"')
    expect(result).toEqual({ url: 'http://localhost:3000' })
  })

  it('decodes an empty array', () => {
    const result = decodeToon('items[0]:')
    expect(result).toEqual({ items: [] })
  })

  it('decodes a primitive array', () => {
    const result = decodeToon('tags[3]: admin,ops,dev')
    expect(result).toEqual({ tags: ['admin', 'ops', 'dev'] })
  })

  it('decodes a numeric array', () => {
    const result = decodeToon('ports[3]: 3000,5173,8080')
    expect(result).toEqual({ ports: [3000, 5173, 8080] })
  })

  it('decodes a nested object', () => {
    const toon = 'interaction:\n  user_prompt: Fix the bug\n  response: Fixed it'
    const result = decodeToon(toon)
    expect(result).toEqual({
      interaction: {
        user_prompt: 'Fix the bug',
        response: 'Fixed it',
      },
    })
  })

  it('decodes multiple top-level fields', () => {
    const toon = 'entry_id: 20260316-001\nsession_date: 2026-03-16\nimportance: high'
    const result = decodeToon(toon)
    expect(result).toEqual({
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      importance: 'high',
    })
  })

  it('decodes escaped backslash in quoted string', () => {
    const result = decodeToon('path: "C:\\\\Users\\\\Alice"')
    expect(result).toEqual({ path: 'C:\\Users\\Alice' })
  })

  it('decodes escaped newline in quoted string', () => {
    const result = decodeToon('text: "line1\\nline2"')
    expect(result).toEqual({ text: 'line1\nline2' })
  })

  it('correctly round-trips a literal backslash-n (not a newline)', () => {
    // "C:\notes" — the \n here is a literal backslash followed by 'n', not a newline
    const original = { path: 'C:\\notes' }
    const encoded = encodeToon(original)
    const decoded = decodeToon(encoded)
    expect(decoded).toEqual(original)
    expect((decoded['path'] as string).includes('\n')).toBe(false)
  })

  it('correctly round-trips a Windows path with multiple backslash sequences', () => {
    const original = { path: 'C:\\Users\\Alice\\notes.txt' }
    const encoded = encodeToon(original)
    const decoded = decodeToon(encoded)
    expect(decoded).toEqual(original)
  })

  it('decodes block scalar multiline string', () => {
    const toon = 'note: |\n  First line.\n  Second line.'
    const result = decodeToon(toon)
    expect(result).toEqual({ note: 'First line.\nSecond line.' })
  })

  it('round-trips a full entry object', () => {
    const original = {
      entry_id: '20260316-001',
      session_date: '2026-03-16',
      importance: 'high',
      tags: ['pivot', 'breakthrough'],
      interaction: {
        user_prompt: 'Fix the blur',
        assistant_response_summary: 'Added -webkit- prefix',
      },
    }
    const encoded = encodeToon(original)
    const decoded = decodeToon(encoded)
    expect(decoded).toEqual(original)
  })
})
