/**
 * Claude Code PostToolUse hook.
 * Receives tool call data via stdin as JSON.
 * Outputs a message to stdout when it's time to offer an archive prompt.
 * Claude Code injects this output back into the conversation context.
 *
 * Hook format (Claude Code):
 *   stdin:  { tool_name, tool_input, tool_response, session_id, cwd }
 *   stdout: plain text — injected as a system message into the session
 *   exit 0: continue normally
 *   exit 1: block the tool call (PreToolUse only — not used here)
 */
import { readConfig } from '../core/storage.js'
import { readState, incrementToolCount, resetToolCount } from './state.js'
import { evaluateSignals, shouldPromptArchive, type ToolCallContext } from './signals.js'

interface HookInput {
  tool_name: string
  tool_input: Record<string, unknown>
  tool_response: unknown
  session_id?: string
  cwd?: string
}

async function main(): Promise<void> {
  let input: HookInput

  try {
    const raw = await readStdin()
    input = JSON.parse(raw) as HookInput
  } catch {
    // Malformed input — silently exit, don't disrupt the session
    process.exit(0)
  }

  const projectPath = input.cwd ?? process.cwd()

  // Check archiving is active for this project
  const config = await readConfig(projectPath)
  if (!config?.archiving) {
    process.exit(0)
  }

  const ctx: ToolCallContext = {
    tool_name: input.tool_name,
    tool_input: input.tool_input ?? {},
    tool_response: input.tool_response,
  }

  // Don't archive archivist's own operations
  if (isArchivistOperation(ctx)) {
    process.exit(0)
  }

  const state = await incrementToolCount(projectPath)
  const signal = evaluateSignals(ctx)
  const { prompt, reason } = shouldPromptArchive(
    signal,
    state.tool_calls_since_archive,
    config.pause_threshold
  )

  if (!prompt) {
    process.exit(0)
  }

  await resetToolCount(projectPath)

  // Output the archive prompt — Claude will see this and ask the user
  const message = buildPromptMessage(reason, ctx.tool_name, state.tool_calls_since_archive)
  process.stdout.write(message)

  process.exit(0)
}

function isArchivistOperation(ctx: ToolCallContext): boolean {
  // Don't trigger when we're writing to documentation_notes or running archivist CLI
  const filePath = String(ctx.tool_input['file_path'] ?? '')
  const command = String(ctx.tool_input['command'] ?? '')

  return (
    filePath.includes('documentation_notes') ||
    command.includes('archivist') ||
    ctx.tool_name === 'TodoWrite'
      ? false // TodoWrite is a signal source, not an archivist op
      : false
  )
}

function buildPromptMessage(reason: string, toolName: string, count: number): string {
  return [
    '',
    `[ARCHIVIST] Natural pause detected after \`${toolName}\` (${count} tool calls since last check).`,
    `Reason: ${reason}`,
    '',
    'Ask the user: **"Want to archive this moment?"**',
    'If yes → ask for an optional voiceover note, then collect context and run `archivist log`.',
    'If no → continue without archiving.',
    '',
    'Keep the ask brief — one line. Do not be disruptive.',
    '',
  ].join('\n')
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

main().catch(() => process.exit(0))
