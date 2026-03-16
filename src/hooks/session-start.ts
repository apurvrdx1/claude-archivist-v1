/**
 * Claude Code UserPromptSubmit hook.
 * Fires on every user message submission.
 * Handles the session-start archiving check — fires once per day, silently otherwise.
 *
 * Hook format (Claude Code):
 *   stdin:  { prompt, session_id, cwd }
 *   stdout: plain text — prepended to the conversation context
 *   exit 0: continue normally
 *   exit 2: block the prompt (used here to inject setup before processing)
 */
import { readState, writeState, markGreeted } from './state.js'
import { readConfig } from '../core/storage.js'

interface SessionStartInput {
  prompt: string
  session_id?: string
  cwd?: string
}

async function main(): Promise<void> {
  let input: SessionStartInput

  try {
    const raw = await readStdin()
    input = JSON.parse(raw) as SessionStartInput
  } catch {
    process.exit(0)
  }

  const projectPath = input.cwd ?? process.cwd()
  const state = await readState(projectPath)

  // Already greeted today or declined — stay silent
  if (state.greeted_today || state.declined_today) {
    process.exit(0)
  }

  const config = await readConfig(projectPath)

  // No config at all
  if (!config) {
    await markGreeted(projectPath)
    process.stdout.write(buildNoConfigMessage())
    process.exit(0)
  }

  // Config exists but archiving is off
  if (!config.archiving) {
    await markGreeted(projectPath)
    process.stdout.write(buildArchivingOffMessage(config.project_name))
    process.exit(0)
  }

  // Archiving is active — silent session start, just mark greeted
  await markGreeted(projectPath)
  process.exit(0)
}

function buildNoConfigMessage(): string {
  return [
    '',
    '[ARCHIVIST] No archiving config found for this project.',
    '',
    'Ask the user once, briefly: **"Want to start archiving this project? (yes/no)"**',
    'If yes → run `archivist init` (prompt for project name if not obvious from context).',
    'If no → note their preference and do not ask again this session.',
    '',
    'Keep it to one sentence. Do not be disruptive.',
    '',
  ].join('\n')
}

function buildArchivingOffMessage(projectName: string): string {
  return [
    '',
    `[ARCHIVIST] Archiving is currently off for "${projectName}".`,
    '',
    'Ask the user once, briefly: **"Want to archive this session?"**',
    'If yes → run `archivist start` to enable.',
    'If no → continue without archiving.',
    '',
    'Keep it to one sentence. Do not be disruptive.',
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
