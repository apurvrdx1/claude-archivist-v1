import { readdir } from 'fs/promises'
import { getArtifactsPath } from '../core/storage.js'

// ─── Naming ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // strip special chars
    .trim()
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
}

/**
 * Build a canonical artifact filename.
 * Format: {seq}_{description}_{state}.{ext}
 * Example: 003_hero-mobile_broken-375px.png
 */
export function buildArtifactName(
  sequence: number,
  description: string,
  state: string,
  ext: string
): string {
  const seq = String(sequence).padStart(3, '0')
  const desc = slugify(description)
  const st = slugify(state)
  return st ? `${seq}_${desc}_${st}.${ext}` : `${seq}_${desc}.${ext}`
}

/**
 * Parse the highest sequence number from a list of artifact filenames.
 * Returns 0 if the directory is empty or contains no artifact files.
 */
export function parseArtifactSequence(files: string[]): number {
  let max = 0
  for (const file of files) {
    const match = file.match(/^(\d{3})_/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > max) max = n
    }
  }
  return max
}

/**
 * Build the relative artifact reference path for a log entry.
 * Always relative to the day folder so it's portable.
 */
export function buildArtifactRef(_date: string, filename: string): string {
  return `artifacts/${filename}`
}

/**
 * Get the next artifact sequence number for a given project + date.
 */
export async function nextArtifactSequence(
  projectPath: string,
  date: string
): Promise<number> {
  const artifactsPath = getArtifactsPath(projectPath, date)
  try {
    const files = await readdir(artifactsPath)
    return parseArtifactSequence(files) + 1
  } catch {
    return 1
  }
}
