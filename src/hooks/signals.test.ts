import { describe, it, expect } from 'vitest'
import { evaluateSignals, shouldPromptArchive, type ToolCallContext } from './signals.js'

// ─── evaluateSignals ──────────────────────────────────────────────────────────

describe('evaluateSignals - TodoWrite', () => {
  it('returns strong signal when a todo is marked completed', () => {
    const ctx: ToolCallContext = {
      tool_name: 'TodoWrite',
      tool_input: {
        todos: [
          { content: 'Build schema', status: 'completed', activeForm: 'Building schema' },
          { content: 'Build logger', status: 'pending', activeForm: 'Building logger' },
        ],
      },
      tool_response: null,
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('strong')
    expect(result.reason).toContain('completed')
  })

  it('returns weak signal when no todos are completed', () => {
    const ctx: ToolCallContext = {
      tool_name: 'TodoWrite',
      tool_input: {
        todos: [
          { content: 'Build schema', status: 'in_progress', activeForm: 'Building' },
        ],
      },
      tool_response: null,
    }
    const result = evaluateSignals(ctx)
    // TodoWrite with no completions is in HIGH_SIGNAL_TOOLS → weak
    expect(result.strength).toBe('weak')
  })
})

describe('evaluateSignals - Bash', () => {
  it('returns strong signal for successful test run', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Bash',
      tool_input: { command: 'npm run test' },
      tool_response: '✓ 103 tests passed',
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('strong')
  })

  it('returns strong signal for failed test run', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Bash',
      tool_input: { command: 'vitest run' },
      tool_response: 'FAIL src/core/schema.test.ts\nError: expected true to be false',
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('strong')
  })

  it('returns strong signal for git commit', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m "feat: add schema"' },
      tool_response: '[master abc1234] feat: add schema',
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('strong')
  })

  it('returns strong signal for build command', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Bash',
      tool_input: { command: 'npm run build' },
      tool_response: 'Build succeeded in 2.3s',
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('strong')
  })

  it('returns none for a mundane ls command', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      tool_response: 'total 8\ndrwxr-xr-x ...',
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('none')
  })
})

describe('evaluateSignals - Write', () => {
  it('returns weak signal for a TypeScript source file', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Write',
      tool_input: { file_path: '/project/src/core/schema.ts' },
      tool_response: null,
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('weak')
  })

  it('returns weak signal for a CSS file', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Write',
      tool_input: { file_path: '/project/src/styles/hero.css' },
      tool_response: null,
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('weak')
  })

  it('returns none for a non-source file', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Write',
      tool_input: { file_path: '/project/some.lock' },
      tool_response: null,
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('none')
  })
})

describe('evaluateSignals - neutral tools', () => {
  it('returns none for Read tool', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Read',
      tool_input: { file_path: '/project/src/cli.ts' },
      tool_response: 'file content...',
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('none')
  })

  it('returns none for Glob tool', () => {
    const ctx: ToolCallContext = {
      tool_name: 'Glob',
      tool_input: { pattern: '**/*.ts' },
      tool_response: ['file1.ts', 'file2.ts'],
    }
    const result = evaluateSignals(ctx)
    expect(result.strength).toBe('none')
  })
})

// ─── shouldPromptArchive ─────────────────────────────────────────────────────

describe('shouldPromptArchive', () => {
  it('prompts on strong signal regardless of count', () => {
    const result = shouldPromptArchive(
      { strength: 'strong', reason: 'Tests passed' },
      1,
      5
    )
    expect(result.prompt).toBe(true)
    expect(result.reason).toBe('Tests passed')
  })

  it('prompts when threshold is reached with no signal', () => {
    const result = shouldPromptArchive(
      { strength: 'none', reason: '' },
      5,
      5
    )
    expect(result.prompt).toBe(true)
  })

  it('does not prompt below threshold with no signal', () => {
    const result = shouldPromptArchive(
      { strength: 'none', reason: '' },
      3,
      5
    )
    expect(result.prompt).toBe(false)
  })

  it('prompts on weak signal at half-threshold', () => {
    const result = shouldPromptArchive(
      { strength: 'weak', reason: 'New file created' },
      3,  // >= floor(5/2) = 2
      5
    )
    expect(result.prompt).toBe(true)
  })

  it('does not prompt on weak signal below half-threshold', () => {
    const result = shouldPromptArchive(
      { strength: 'weak', reason: 'New file created' },
      1,  // < floor(5/2) = 2
      5
    )
    expect(result.prompt).toBe(false)
  })

  it('uses custom threshold', () => {
    const result = shouldPromptArchive(
      { strength: 'none', reason: '' },
      10,
      10
    )
    expect(result.prompt).toBe(true)
  })
})
