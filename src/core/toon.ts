/**
 * TOON v3.0 encoder/decoder — Token-Oriented Object Notation
 * Implements a subset of the spec sufficient for the archivist log schema:
 *   - Primitive values (string, number, boolean, null)
 *   - Nested objects (2-space indentation)
 *   - Primitive arrays (inline key[N]: v1,v2,v3)
 *   - Block scalar multiline strings (key: |\n  line\n  line)
 *   - Quoted strings for values requiring it
 *   - Escape sequences: \\ \" \n \r \t
 */

export type ToonValue =
  | string
  | number
  | boolean
  | null
  | ToonValue[]
  | { [key: string]: ToonValue }

// ─── String quoting rules (per spec §Strings) ─────────────────────────────────

const NUMERIC_RE = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const LEADING_ZERO_RE = /^0\d/
const RESERVED = new Set(['true', 'false', 'null'])

function needsQuoting(value: string): boolean {
  if (value === '') return true
  if (value !== value.trim()) return true
  if (RESERVED.has(value)) return true
  if (NUMERIC_RE.test(value) && !LEADING_ZERO_RE.test(value)) return true
  if (/[:,\\"[\]{}]/.test(value)) return true
  if (/[\n\r\t]/.test(value)) return true
  if (value === '-' || value.startsWith('-')) {
    // Only quote bare hyphen or hyphen-only; allow normal words starting with -
    if (/^-+$/.test(value)) return true
  }
  return false
}

function escapeString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function unescapeString(value: string): string {
  // Single-pass replacement — avoids order-of-operations corruption.
  // e.g. "C:\\notes" must decode to "C:\notes", not "C:" + newline + "otes".
  return value.replace(/\\(\\|n|r|t|")/g, (_, ch: string) => {
    switch (ch) {
      case '\\': return '\\'
      case 'n':  return '\n'
      case 'r':  return '\r'
      case 't':  return '\t'
      case '"':  return '"'
      default:   return ch
    }
  })
}

function encodeScalar(value: string): string {
  if (needsQuoting(value)) {
    return `"${escapeString(value)}"`
  }
  return value
}

// ─── Multiline block scalar ───────────────────────────────────────────────────

function isMultilineCandidate(value: string): boolean {
  return value.includes('\n') && value.length > 60
}

function encodeBlockScalar(key: string, value: string, indent: string): string {
  const lines = value.split('\n')
  const childIndent = indent + '  '
  const body = lines.map(l => `${childIndent}${l}`).join('\n')
  return `${indent}${key}: |\n${body}`
}

// ─── Array value quoting ─────────────────────────────────────────────────────

function encodeArrayValue(value: ToonValue): string {
  if (typeof value === 'string') {
    // In array context also quote comma-containing strings
    if (needsQuoting(value) || value.includes(',')) {
      return `"${escapeString(value)}"`
    }
    return value
  }
  if (value === null) return 'null'
  if (typeof value === 'boolean') return String(value)
  if (typeof value === 'number') return String(value)
  return String(value)
}

// ─── Encoder ─────────────────────────────────────────────────────────────────

function encodeValue(key: string, value: ToonValue, indent: string): string {
  const prefix = `${indent}${key}`

  if (value === null) return `${prefix}: null`

  if (typeof value === 'boolean') return `${prefix}: ${value}`

  if (typeof value === 'number') return `${prefix}: ${value}`

  if (typeof value === 'string') {
    if (isMultilineCandidate(value)) {
      return encodeBlockScalar(key, value, indent)
    }
    return `${prefix}: ${encodeScalar(value)}`
  }

  if (Array.isArray(value)) {
    const n = value.length
    if (n === 0) return `${prefix}[0]:`

    // Only inline primitive arrays
    const allPrimitive = value.every(
      v => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    )

    if (allPrimitive) {
      const encoded = (value as (string | number | boolean | null)[])
        .map(encodeArrayValue)
        .join(',')
      return `${prefix}[${n}]: ${encoded}`
    }

    // Non-primitive arrays: expanded list items
    const childIndent = indent + '  '
    const items = value
      .map(item => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const fields = Object.entries(item as Record<string, ToonValue>)
            .map(([k, v]) => encodeValue(k, v, childIndent + '  '))
            .join('\n')
          return `${childIndent}-\n${fields}`
        }
        return `${childIndent}- ${encodeArrayValue(item)}`
      })
      .join('\n')
    return `${prefix}[${n}]:\n${items}`
  }

  if (typeof value === 'object') {
    const childIndent = indent + '  '
    const fields = Object.entries(value as Record<string, ToonValue>)
      .map(([k, v]) => encodeValue(k, v, childIndent))
      .join('\n')
    return `${prefix}:\n${fields}`
  }

  return `${prefix}: ${String(value)}`
}

export function encodeToon(obj: Record<string, ToonValue>): string {
  return Object.entries(obj)
    .map(([k, v]) => encodeValue(k, v, ''))
    .join('\n')
}

// ─── Decoder ─────────────────────────────────────────────────────────────────

function parseScalar(raw: string): string | number | boolean | null {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null

  // Quoted string
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return unescapeString(raw.slice(1, -1))
  }

  // Number
  if (NUMERIC_RE.test(raw) && !LEADING_ZERO_RE.test(raw)) {
    const n = Number(raw)
    if (!Number.isNaN(n)) return n
  }

  return raw
}

function parseArrayValues(raw: string): (string | number | boolean | null)[] {
  if (raw.trim() === '') return []
  const parts: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '\\' && inQuote) {
      current += ch + (raw[i + 1] ?? '')
      i++
      continue
    }
    if (ch === '"') {
      inQuote = !inQuote
      current += ch
      continue
    }
    if (ch === ',' && !inQuote) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)

  return parts.map(p => parseScalar(p.trim()))
}

interface Line {
  indent: number
  raw: string
}

function getIndent(line: string): number {
  let i = 0
  while (i < line.length && line[i] === ' ') i++
  return i
}

function parseLines(lines: Line[], startIdx: number, baseIndent: number): [Record<string, ToonValue>, number] {
  const obj: Record<string, ToonValue> = {}
  let i = startIdx

  while (i < lines.length) {
    const line = lines[i]
    if (line.indent < baseIndent) break

    const raw = line.raw.trim()

    // Block scalar: key: |
    const blockMatch = raw.match(/^([A-Za-z_][A-Za-z0-9_.]*): \|$/)
    if (blockMatch) {
      const key = blockMatch[1]
      const blockIndent = line.indent + 2
      const blockLines: string[] = []
      i++
      while (i < lines.length && lines[i].indent >= blockIndent) {
        blockLines.push(lines[i].raw.slice(blockIndent))
        i++
      }
      obj[key] = blockLines.join('\n')
      continue
    }

    // Array header: key[N]: values  or  key[N]:
    const arrayMatch = raw.match(/^([A-Za-z_][A-Za-z0-9_.]*)\[(\d+)\](?:\||\t)?:(.*)$/)
    if (arrayMatch) {
      const key = arrayMatch[1]
      const count = parseInt(arrayMatch[2], 10)
      const rest = arrayMatch[3].trim()

      if (count === 0) {
        obj[key] = []
        i++
        continue
      }

      if (rest !== '') {
        // Inline primitive array
        obj[key] = parseArrayValues(rest)
        i++
        continue
      }

      // Expanded array
      const childIndent = line.indent + 2
      const items: ToonValue[] = []
      i++
      while (i < lines.length && lines[i].indent >= childIndent) {
        const itemLine = lines[i].raw.trim()
        if (itemLine.startsWith('- ')) {
          items.push(parseScalar(itemLine.slice(2).trim()))
          i++
        } else if (itemLine === '-') {
          items.push({})
          i++
        } else {
          break
        }
      }
      obj[key] = items
      continue
    }

    // Nested object: key:
    const objMatch = raw.match(/^([A-Za-z_][A-Za-z0-9_.]*):$/)
    if (objMatch) {
      const key = objMatch[1]
      const childIndent = line.indent + 2
      i++
      if (i < lines.length && lines[i].indent >= childIndent) {
        const [nested, nextI] = parseLines(lines, i, childIndent)
        obj[key] = nested
        i = nextI
      } else {
        obj[key] = {}
      }
      continue
    }

    // Simple key: value
    const kvMatch = raw.match(/^([A-Za-z_][A-Za-z0-9_.]*): (.*)$/)
    if (kvMatch) {
      const key = kvMatch[1]
      const val = kvMatch[2].trim()
      obj[key] = parseScalar(val)
      i++
      continue
    }

    i++
  }

  return [obj, i]
}

export function decodeToon(toon: string): Record<string, ToonValue> {
  const rawLines = toon.split('\n')
  const lines: Line[] = rawLines
    .map(raw => ({ indent: getIndent(raw), raw }))
    .filter(l => l.raw.trim() !== '' && !l.raw.trim().startsWith('#'))

  const [obj] = parseLines(lines, 0, 0)
  return obj
}
