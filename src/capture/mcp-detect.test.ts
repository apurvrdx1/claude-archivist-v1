import { describe, it, expect } from 'vitest'
import { detectMcpFromSettings, type McpPresence } from './mcp-detect.js'

// ─── detectMcpFromSettings ────────────────────────────────────────────────────

describe('detectMcpFromSettings', () => {
  it('returns no MCPs when settings has no mcpServers', () => {
    const result = detectMcpFromSettings({})
    expect(result.figma).toBe(false)
    expect(result.paper).toBe(false)
  })

  it('returns no MCPs when mcpServers is empty', () => {
    const result = detectMcpFromSettings({ mcpServers: {} })
    expect(result.figma).toBe(false)
    expect(result.paper).toBe(false)
  })

  it('detects Figma MCP by key name "figma"', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        figma: { command: 'npx', args: ['@figma/mcp'] },
      },
    })
    expect(result.figma).toBe(true)
    expect(result.figmaServerKey).toBe('figma')
  })

  it('detects Figma MCP by command containing @figma/mcp', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        design: { command: 'npx', args: ['@figma/mcp'] },
      },
    })
    expect(result.figma).toBe(true)
    expect(result.figmaServerKey).toBe('design')
  })

  it('detects Figma MCP by command containing figma', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        myserver: { command: 'figma-mcp' },
      },
    })
    expect(result.figma).toBe(true)
  })

  it('detects Paper.design MCP by key name "paper"', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        paper: { command: 'npx', args: ['@paper-design/mcp'] },
      },
    })
    expect(result.paper).toBe(true)
    expect(result.paperServerKey).toBe('paper')
  })

  it('detects Paper.design MCP by key containing paper-design', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        'paper-design': { command: 'npx', args: ['@paper-design/mcp'] },
      },
    })
    expect(result.paper).toBe(true)
  })

  it('detects Paper.design MCP by command containing paper', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        myserver: { command: 'npx', args: ['@paper-design/mcp-server'] },
      },
    })
    expect(result.paper).toBe(true)
  })

  it('detects both Figma and Paper MCPs simultaneously', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        figma: { command: 'npx', args: ['@figma/mcp'] },
        paper: { command: 'npx', args: ['@paper-design/mcp'] },
      },
    })
    expect(result.figma).toBe(true)
    expect(result.paper).toBe(true)
  })

  it('is case-insensitive for key and command matching', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        Figma: { command: 'FIGMA-MCP' },
      },
    })
    expect(result.figma).toBe(true)
  })

  it('returns summary string listing detected MCPs', () => {
    const result = detectMcpFromSettings({
      mcpServers: {
        figma: { command: 'npx', args: ['@figma/mcp'] },
      },
    })
    expect(result.summary).toContain('figma')
  })

  it('returns "none" summary when no MCPs detected', () => {
    const result = detectMcpFromSettings({})
    expect(result.summary).toBe('none')
  })
})
