/**
 * CLI bridge: receives Figma/Paper MCP image bytes via stdin and saves
 * them as a named artifact in the project's daily artifacts directory.
 *
 * Usage:
 *   <image-bytes> | npx tsx save-figma.ts \
 *     --date 2026-03-16 \
 *     --description "hero-section" \
 *     --state "figma-export"
 *
 * Outputs JSON: { success, artifactRef, filename, error? }
 */
import { Command } from 'commander'
import { resolve } from 'path'
import { saveFigmaArtifact } from './figma.js'

const program = new Command()

program
  .option('--date <date>', 'Session date YYYY-MM-DD')
  .option('--description <text>', 'Artifact description')
  .option('--state <text>', 'Capture state (e.g. figma-export, artboard)', 'figma-export')
  .parse()

const opts = program.opts<{ date: string; description: string; state: string }>()

async function readStdin(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', chunk => chunks.push(Buffer.from(chunk)))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)))
    process.stdin.on('error', reject)
  })
}

async function main(): Promise<void> {
  const projectPath = resolve(process.env['ARCHIVIST_PROJECT_PATH'] ?? process.cwd())
  const date = opts.date ?? new Date().toISOString().slice(0, 10)
  const description = opts.description ?? 'figma-capture'

  const imageBuffer = await readStdin()

  if (imageBuffer.length === 0) {
    process.stdout.write(JSON.stringify({ success: false, error: 'No image data received on stdin' }))
    process.exit(1)
  }

  const result = await saveFigmaArtifact({
    projectPath,
    date,
    description,
    state: opts.state,
    imageBuffer,
  })

  process.stdout.write(JSON.stringify(result))
  process.exit(result.success ? 0 : 1)
}

main().catch(err => {
  process.stdout.write(JSON.stringify({ success: false, error: String(err) }))
  process.exit(1)
})
