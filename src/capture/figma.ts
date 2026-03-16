/**
 * Figma MCP capture layer.
 *
 * This module does NOT call the Figma API directly. Instead it provides:
 *   1. Instructions for the /archive skill to prompt Claude to use
 *      the active Figma MCP tools in the session.
 *   2. A save-to-artifact helper that takes image bytes returned by
 *      the MCP tool and writes them to the daily artifacts directory.
 *
 * Why this approach:
 *   The Figma MCP tools (get_image, get_file, etc.) are only available
 *   as Claude tool calls within an active session. They cannot be called
 *   from a Node.js subprocess. So we generate instructions for Claude
 *   to invoke them, then receive the result back via the skill flow.
 */
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getArtifactsPath } from '../core/storage.js'
import { buildArtifactName, buildArtifactRef, nextArtifactSequence } from './artifact.js'

export interface FigmaCaptureInstructions {
  /** Prompt Claude should issue to the Figma MCP tool */
  prompt: string
  /** Context for the skill about what we're trying to capture */
  context: string
}

export interface FigmaArtifactSaveResult {
  filename: string
  artifactRef: string
  success: boolean
  error?: string
}

// ─── Instruction generator ────────────────────────────────────────────────────

/**
 * Generate instructions for the /archive skill to capture a Figma frame
 * using the active Figma MCP tools in the Claude session.
 *
 * The skill passes these instructions to Claude, which then invokes
 * the Figma MCP tool and hands the image bytes back to saveToArtifact().
 */
export function buildFigmaCaptureInstructions(opts: {
  description: string
  frameHint?: string   // e.g. "hero section", "mobile nav"
  fileHint?: string    // e.g. Figma file name or URL
}): FigmaCaptureInstructions {
  const frameRef = opts.frameHint
    ? `the frame or component related to "${opts.frameHint}"`
    : 'the most recently discussed or visible frame'

  const fileRef = opts.fileHint
    ? `in the file "${opts.fileHint}"`
    : 'in the currently open Figma file'

  return {
    prompt: [
      `Use the Figma MCP tool to export an image of ${frameRef} ${fileRef}.`,
      `Use PNG format at 2x scale.`,
      `Return the image bytes so they can be saved as a documentary artifact.`,
    ].join(' '),
    context: `Capturing Figma frame for: "${opts.description}"`,
  }
}

// ─── Artifact saver ───────────────────────────────────────────────────────────

/**
 * Save image bytes returned by the Figma MCP tool to the artifacts directory.
 * Called by the skill after Claude invokes the MCP tool and receives image data.
 */
export async function saveFigmaArtifact(opts: {
  projectPath: string
  date: string
  description: string
  state?: string
  imageBuffer: Buffer | Uint8Array
}): Promise<FigmaArtifactSaveResult> {
  const seq = await nextArtifactSequence(opts.projectPath, opts.date)
  const filename = buildArtifactName(seq, opts.description, opts.state ?? 'figma', 'png')
  const outputPath = join(getArtifactsPath(opts.projectPath, opts.date), filename)
  const ref = buildArtifactRef(opts.date, filename)

  try {
    await writeFile(outputPath, opts.imageBuffer)
    return { filename, artifactRef: ref, success: true }
  } catch (err) {
    return { filename, artifactRef: ref, success: false, error: String(err) }
  }
}

// ─── Skill prompt fragment ────────────────────────────────────────────────────

/**
 * Returns the prompt fragment to inject into the /archive skill when
 * Figma MCP is detected. The skill appends this to its visual capture step.
 */
export function figmaSkillFragment(serverKey: string): string {
  return [
    `**Figma MCP detected** (server: \`${serverKey}\`)`,
    '',
    'To capture a Figma frame:',
    '1. Ask the user: "Which frame or component should I capture? (or press Enter to skip)"',
    '2. If they provide a frame name → use the Figma MCP tool to export it as PNG',
    '3. Save the result by running:',
    '   ```bash',
    '   ARCHIVIST_PROJECT_PATH={cwd} npx tsx {ARCHIVIST_PATH}/src/capture/save-figma.ts \\',
    '     --date "{today}" --description "{description}" --state "figma-export"',
    '   ```',
    '   Pass the image bytes from the MCP tool via stdin.',
    '4. Add the returned artifact ref to the log entry.',
  ].join('\n')
}

// ─── Paper.design skill fragment ──────────────────────────────────────────────

/**
 * Returns the prompt fragment for Paper.design MCP.
 * Paper.design's MCP tool surface is similar — export artboard as image.
 */
export function paperSkillFragment(serverKey: string): string {
  return [
    `**Paper.design MCP detected** (server: \`${serverKey}\`)`,
    '',
    'To capture a Paper.design artboard:',
    '1. Ask the user: "Which artboard should I capture? (or press Enter to skip)"',
    '2. If they provide an artboard name → use the Paper.design MCP tool to export it',
    '3. Save the result the same way as a Figma export (PNG, artifact ref to log).',
  ].join('\n')
}
