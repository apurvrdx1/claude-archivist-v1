/**
 * MCP presence detector.
 * Reads ~/.claude/settings.json to determine which MCP servers are configured.
 * Used by the visual capture layer to decide which capture paths are available.
 */
import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

export interface McpPresence {
  figma: boolean
  figmaServerKey: string | null
  paper: boolean
  paperServerKey: string | null
  summary: string
}

interface McpServerEntry {
  command?: string
  args?: string[]
  env?: Record<string, string>
}

type ClaudeSettings = {
  mcpServers?: Record<string, McpServerEntry>
  [key: string]: unknown
}

// ─── Detection helpers ────────────────────────────────────────────────────────

function isFigmaServer(key: string, entry: McpServerEntry): boolean {
  const keyLower = key.toLowerCase()
  const cmdLower = (entry.command ?? '').toLowerCase()
  const argsLower = (entry.args ?? []).join(' ').toLowerCase()

  return (
    keyLower.includes('figma') ||
    cmdLower.includes('figma') ||
    argsLower.includes('figma')
  )
}

function isPaperServer(key: string, entry: McpServerEntry): boolean {
  const keyLower = key.toLowerCase()
  const cmdLower = (entry.command ?? '').toLowerCase()
  const argsLower = (entry.args ?? []).join(' ').toLowerCase()

  return (
    keyLower.includes('paper') ||
    cmdLower.includes('paper') ||
    argsLower.includes('paper')
  )
}

// ─── Core detector (testable — accepts parsed settings) ───────────────────────

export function detectMcpFromSettings(settings: ClaudeSettings): McpPresence {
  const servers = settings.mcpServers ?? {}
  const entries = Object.entries(servers)

  let figma = false
  let figmaServerKey: string | null = null
  let paper = false
  let paperServerKey: string | null = null

  for (const [key, entry] of entries) {
    if (!figma && isFigmaServer(key, entry)) {
      figma = true
      figmaServerKey = key
    }
    if (!paper && isPaperServer(key, entry)) {
      paper = true
      paperServerKey = key
    }
  }

  const detected: string[] = []
  if (figma) detected.push('figma')
  if (paper) detected.push('paper-design')

  return {
    figma,
    figmaServerKey,
    paper,
    paperServerKey,
    summary: detected.length > 0 ? detected.join(', ') : 'none',
  }
}

// ─── File-based detector (used at runtime) ────────────────────────────────────

export async function detectMcps(claudeDir?: string): Promise<McpPresence> {
  const settingsPath = join(claudeDir ?? join(homedir(), '.claude'), 'settings.json')

  try {
    const raw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as ClaudeSettings
    return detectMcpFromSettings(settings)
  } catch {
    // Settings file not found or unreadable — no MCPs
    return {
      figma: false,
      figmaServerKey: null,
      paper: false,
      paperServerKey: null,
      summary: 'none',
    }
  }
}
