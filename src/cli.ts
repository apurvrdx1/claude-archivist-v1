#!/usr/bin/env node
import { Command } from 'commander'
import { createInterface } from 'readline'
import { resolve } from 'path'
import { readConfig, writeConfig } from './core/storage.js'
import { openSession, closeSession, getSessionStatus, enableArchiving, formatSessionSummary } from './core/session.js'
import { buildEntry, writeEntry, nextEntryId } from './core/logger.js'
import { countEntriesInLog } from './core/session.js'
import { InteractionType, Phase, Importance, EntryStatus } from './core/schema.js'

const program = new Command()

program
  .name('archivist')
  .description('Story-first archival system for AI-assisted design and development projects')
  .version('1.0.0')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function projectPath(): string {
  return resolve(process.env['ARCHIVIST_PROJECT_PATH'] ?? process.cwd())
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function promptMultiline(label: string): Promise<string> {
  console.log(`${label} (press Enter twice to finish):`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const lines: string[] = []
  return new Promise(resolve => {
    rl.on('line', line => {
      if (line === '' && lines.length > 0 && lines[lines.length - 1] === '') {
        rl.close()
        resolve(lines.slice(0, -1).join('\n').trim())
      } else {
        lines.push(line)
      }
    })
  })
}

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize archiving for the current project')
  .option('-n, --name <name>', 'Project name')
  .option('-t, --threshold <n>', 'Pause threshold (default: 5)', '5')
  .action(async (opts) => {
    const path = projectPath()
    const existing = await readConfig(path)

    if (existing?.archiving) {
      console.log(`✓ Archiving already active for "${existing.project_name}"`)
      return
    }

    const name = opts.name ?? await prompt('Project name: ')
    const threshold = parseInt(opts.threshold, 10)

    const config = await enableArchiving(path, name)
    config.pause_threshold = threshold
    await writeConfig(path, config)

    console.log(`✓ Archiving initialized for "${name}"`)
    console.log(`  Archive location: ${path}/documentation_notes/`)
    console.log(`  Pause threshold:  every ${threshold} tool calls`)
  })

// ─── start ────────────────────────────────────────────────────────────────────

program
  .command('start')
  .description('Open a new archiving session for today')
  .action(async () => {
    const path = projectPath()
    const status = await getSessionStatus(path)

    if (status.state === 'no_config') {
      console.log('No archivist config found. Run: archivist init')
      process.exit(1)
    }

    if (status.state === 'archiving_off') {
      const answer = await prompt('Archiving is off. Enable it for this session? (y/n) ')
      if (answer.toLowerCase() !== 'y') {
        console.log('Archiving remains off.')
        return
      }
      await writeConfig(path, { ...status.config!, archiving: true })
    }

    const date = today()
    const meta = await openSession(path, date)
    console.log(`✓ Session started: ${meta.session_id}`)
    console.log(`  Project: ${meta.project_name}`)
    console.log(`  Date:    ${date}`)
    console.log(`  Log:     documentation_notes/records/${date}/daily_log.toon`)
  })

// ─── log ──────────────────────────────────────────────────────────────────────

program
  .command('log')
  .description('Add an archive entry for the current moment')
  .option('--objective <text>', 'What was being accomplished')
  .option('--prompt <text>', 'The user prompt that initiated this')
  .option('--response <text>', 'Summary of what the assistant did')
  .option('--type <type>', 'Interaction type', InteractionType.implementation)
  .option('--phase <phase>', 'Project phase', Phase.build)
  .option('--importance <level>', 'Importance level', Importance.medium)
  .option('--tools <list>', 'Comma-separated tools used')
  .option('--files <list>', 'Comma-separated files touched')
  .option('--tags <list>', 'Comma-separated narrative tags')
  .option('--voiceover', 'Prompt for a voiceover/storytelling note')
  .action(async (opts) => {
    const path = projectPath()
    const date = today()

    const objective = opts.objective ?? await prompt('Objective (what were you trying to do): ')
    const userPrompt = opts.prompt ?? await prompt('User prompt (or press Enter to skip): ')
    const responseSummary = opts.response ?? await prompt('What did the assistant do: ')

    let voiceover: string | undefined
    if (opts.voiceover) {
      voiceover = await promptMultiline('Voiceover note')
    }

    const existingCount = await countEntriesInLog(path, date)
    const entryId = nextEntryId(date, existingCount)

    const entry = buildEntry({
      entry_id: entryId,
      session_date: date,
      objective,
      user_prompt: userPrompt,
      assistant_response_summary: responseSummary,
      interaction_type: opts.type as typeof InteractionType[keyof typeof InteractionType],
      phase: opts.phase as typeof Phase[keyof typeof Phase],
      importance: opts.importance as typeof Importance[keyof typeof Importance],
      status: EntryStatus.resolved,
      tools_used: opts.tools ? opts.tools.split(',').map((s: string) => s.trim()) : [],
      files_touched: opts.files ? opts.files.split(',').map((s: string) => s.trim()) : [],
      narrative_tags: opts.tags ? opts.tags.split(',').map((s: string) => s.trim()) : [],
      voiceover_note: voiceover,
    })

    await writeEntry(path, date, entry)
    console.log(`✓ Entry logged: ${entryId}`)
    console.log(`  "${objective}"`)
  })

// ─── end ──────────────────────────────────────────────────────────────────────

program
  .command('end')
  .description('Close the current session with a summary')
  .option('--loops <text>', 'Comma-separated open loops to record')
  .action(async (opts) => {
    const path = projectPath()
    const date = today()

    const status = await getSessionStatus(path)
    if (status.state === 'no_config' || status.state === 'archiving_off') {
      console.log('No active archiving session.')
      return
    }

    const entryCount = await countEntriesInLog(path, date)
    const openLoops = opts.loops
      ? opts.loops.split(',').map((s: string) => s.trim())
      : []

    const meta = {
      session_id: `sess-${date.replace(/-/g, '')}-END`,
      session_date: date,
      project_name: status.config!.project_name,
      project_path: path,
      opened_at: new Date().toISOString(),
      entry_count: entryCount,
      artifacts_count: 0,
      open_loops: openLoops,
    }

    const closed = await closeSession(path, date, meta)
    console.log(formatSessionSummary(closed))
  })

// ─── status ───────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show archiving status for the current project')
  .action(async () => {
    const path = projectPath()
    const status = await getSessionStatus(path)
    const date = today()

    console.log(`Project path: ${path}`)

    if (status.state === 'no_config') {
      console.log('Status: Not initialized. Run: archivist init')
      return
    }

    if (status.state === 'archiving_off') {
      console.log(`Status: Archiving OFF (project: ${status.config!.project_name})`)
      console.log('Run: archivist start  to enable')
      return
    }

    const entryCount = await countEntriesInLog(path, date)
    console.log(`Status: Active ✓`)
    console.log(`Project:   ${status.config!.project_name}`)
    console.log(`Phase:     ${status.config!.phase}`)
    console.log(`Threshold: every ${status.config!.pause_threshold} tool calls`)
    console.log(`Entries today: ${entryCount}`)
    console.log(`Log: documentation_notes/records/${date}/daily_log.toon`)
  })

program.parse()
