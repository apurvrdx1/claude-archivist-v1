/**
 * Completion signal detection.
 * Analyses Claude Code tool call data to determine whether a natural
 * archiving pause has occurred — task finished, error resolved, pivot made, etc.
 */

export type SignalStrength = 'none' | 'weak' | 'strong'

export interface CompletionSignal {
  strength: SignalStrength
  reason: string
}

export interface ToolCallContext {
  tool_name: string
  tool_input: Record<string, unknown>
  tool_response: unknown
}

// ─── Tool-based signals ───────────────────────────────────────────────────────

/**
 * Tools that typically mark meaningful moments worth archiving.
 */
const HIGH_SIGNAL_TOOLS = new Set([
  'TodoWrite', // Task status changes — especially completed items
])

// Bash and Write have dedicated detectors — do not add them here
const MEDIUM_SIGNAL_TOOLS = new Set<string>([])

/**
 * Detect a TodoWrite where items are being marked completed.
 */
function detectTodoCompletion(ctx: ToolCallContext): CompletionSignal {
  if (ctx.tool_name !== 'TodoWrite') return { strength: 'none', reason: '' }

  const todos = ctx.tool_input['todos']
  if (!Array.isArray(todos)) return { strength: 'none', reason: '' }

  const hasCompleted = todos.some(
    (t: unknown) =>
      typeof t === 'object' &&
      t !== null &&
      (t as Record<string, unknown>)['status'] === 'completed'
  )

  if (hasCompleted) {
    return {
      strength: 'strong',
      reason: 'Task marked as completed — natural story beat',
    }
  }

  return { strength: 'none', reason: '' }
}

/**
 * Detect a Bash command that looks like a meaningful completion:
 * test run, build, install, deploy, or git operation.
 */
function detectBashCompletion(ctx: ToolCallContext): CompletionSignal {
  if (ctx.tool_name !== 'Bash') return { strength: 'none', reason: '' }

  const command = String(ctx.tool_input['command'] ?? '')
  const response = String(ctx.tool_response ?? '')

  const strongPatterns = [
    /npm (run |exec )?test/i,
    /vitest/i,
    /jest/i,
    /pytest/i,
    /go test/i,
    /npm run build/i,
    /tsc\b/i,
    /git commit/i,
    /git push/i,
    /npm publish/i,
    /vercel deploy/i,
    /fly deploy/i,
  ]

  const errorPatterns = [
    /error:/i,
    /failed/i,
    /✗/,
    /FAIL\b/,
    /exception/i,
  ]

  const successPatterns = [
    /✓|✔|PASS|passed|success/i,
    /Tests\s+\d+\s+passed/i,
    /Build succeeded/i,
    /Done in/i,
    /^\[.+\] .+/m,  // git commit output: [branch hash] message
  ]

  const isSignificantCommand = strongPatterns.some(p => p.test(command))

  if (!isSignificantCommand) {
    // Still a medium signal for Write tool creating new files
    return { strength: 'none', reason: '' }
  }

  const hasError = errorPatterns.some(p => p.test(response))
  const hasSuccess = successPatterns.some(p => p.test(response))

  if (hasError) {
    return {
      strength: 'strong',
      reason: `Significant command with error detected — "${command.slice(0, 60)}"`,
    }
  }

  if (hasSuccess) {
    return {
      strength: 'strong',
      reason: `Significant command succeeded — "${command.slice(0, 60)}"`,
    }
  }

  // Ran a significant command, outcome unclear
  return {
    strength: 'weak',
    reason: `Ran significant command — "${command.slice(0, 60)}"`,
  }
}

/**
 * Detect a Write operation creating a new file — often marks a deliverable.
 */
function detectFileCreation(ctx: ToolCallContext): CompletionSignal {
  if (ctx.tool_name !== 'Write') return { strength: 'none', reason: '' }

  const filePath = String(ctx.tool_input['file_path'] ?? '')
  const isSourceFile = /\.(ts|tsx|js|jsx|py|go|css|html|md|json)$/.test(filePath)

  if (isSourceFile) {
    return {
      strength: 'weak',
      reason: `New source file created — ${filePath.split('/').pop()}`,
    }
  }

  return { strength: 'none', reason: '' }
}

// ─── Main signal evaluator ────────────────────────────────────────────────────

/**
 * Evaluate all signals for a given tool call.
 * Returns the strongest signal found.
 */
export function evaluateSignals(ctx: ToolCallContext): CompletionSignal {
  const candidates: CompletionSignal[] = [
    detectTodoCompletion(ctx),
    detectBashCompletion(ctx),
    detectFileCreation(ctx),
  ]

  const strong = candidates.find(s => s.strength === 'strong')
  if (strong) return strong

  const weak = candidates.find(s => s.strength === 'weak')
  if (weak) return weak

  // Check if this is a high-signal tool with no specific pattern matched
  if (HIGH_SIGNAL_TOOLS.has(ctx.tool_name)) {
    return { strength: 'weak', reason: `${ctx.tool_name} tool used` }
  }

  if (MEDIUM_SIGNAL_TOOLS.has(ctx.tool_name)) {
    return { strength: 'weak', reason: `${ctx.tool_name} tool used` }
  }

  return { strength: 'none', reason: '' }
}

/**
 * Decide whether to prompt the user to archive, given the current state.
 */
export function shouldPromptArchive(
  signal: CompletionSignal,
  toolCallCount: number,
  threshold: number
): { prompt: boolean; reason: string } {
  // Strong signal always prompts
  if (signal.strength === 'strong') {
    return { prompt: true, reason: signal.reason }
  }

  // Fallback: threshold reached
  if (toolCallCount >= threshold) {
    return {
      prompt: true,
      reason: `${toolCallCount} tool calls since last archive check`,
    }
  }

  // Weak signal + over half the threshold
  if (signal.strength === 'weak' && toolCallCount >= Math.floor(threshold / 2)) {
    return { prompt: true, reason: signal.reason }
  }

  return { prompt: false, reason: '' }
}
