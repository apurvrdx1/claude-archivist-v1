/**
 * Screenshot CLI — called by the /archive skill to capture browser UI states.
 *
 * Usage:
 *   ARCHIVIST_PROJECT_PATH=/path/to/project npx tsx screenshot.ts \
 *     --url http://localhost:3000 \
 *     --date 2026-03-16 \
 *     --description "hero-section" \
 *     --state "broken" \
 *     --breakpoints 375,768,1280
 *
 * Outputs JSON: { success, artifactRefs, captures, error? }
 */
import { Command } from 'commander'
import { resolve } from 'path'
import { runPlaywrightCapture } from './visual.js'

const program = new Command()

program
  .option('--url <url>', 'URL to capture')
  .option('--date <date>', 'Session date YYYY-MM-DD')
  .option('--description <text>', 'What is being captured (used in filename)')
  .option('--state <text>', 'State label: broken, fixed, initial, etc.', '')
  .option('--breakpoints <list>', 'Comma-separated widths in px', '375,768,1280')
  .option('--full-page', 'Capture full page height', false)
  .parse()

const opts = program.opts<{
  url: string
  date: string
  description: string
  state: string
  breakpoints: string
  fullPage: boolean
}>()

async function main(): Promise<void> {
  if (!opts.url) {
    process.stdout.write(JSON.stringify({ success: false, error: '--url is required' }))
    process.exit(1)
  }

  const projectPath = resolve(process.env['ARCHIVIST_PROJECT_PATH'] ?? process.cwd())
  const date = opts.date ?? new Date().toISOString().slice(0, 10)
  const breakpoints = opts.breakpoints.split(',').map(b => parseInt(b.trim(), 10)).filter(Boolean)

  const result = await runPlaywrightCapture({
    projectPath,
    date,
    url: opts.url,
    description: opts.description ?? 'screenshot',
    state: opts.state,
    breakpoints,
  })

  process.stdout.write(JSON.stringify(result))
  process.exit(result.success ? 0 : 1)
}

main().catch(err => {
  process.stdout.write(JSON.stringify({ success: false, error: String(err) }))
  process.exit(1)
})
