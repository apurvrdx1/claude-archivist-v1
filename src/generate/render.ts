/**
 * Content generation orchestrator.
 * Queries entries, applies a template, writes output to generated_content/.
 */
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { ARCHIVE_ROOT } from '../core/schema.js'
import { readConfig } from '../core/storage.js'
import { queryEntries, type QueryFilter } from './query.js'
import { renderBlog, renderCaseStudy, renderSocial, renderThread, type OutputFormat } from './templates.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateOptions {
  projectPath: string
  format: OutputFormat
  filter: QueryFilter
  /** Override output directory (defaults to documentation_notes/generated_content/) */
  outputPath?: string
}

export interface GenerateResult {
  outputFile: string
  entryCount: number
  format: OutputFormat
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function generateContent(opts: GenerateOptions): Promise<GenerateResult> {
  const { projectPath, format, filter } = opts

  const config = await readConfig(projectPath)
  const projectName = config?.project_name ?? 'Untitled Project'

  const { entries } = await queryEntries(projectPath, filter)

  // Apply template
  let content: string
  switch (format) {
    case 'blog':       content = renderBlog(entries, projectName);      break
    case 'case-study': content = renderCaseStudy(entries, projectName); break
    case 'social':     content = renderSocial(entries, projectName);    break
    case 'thread':     content = renderThread(entries, projectName);    break
  }

  // Build output path
  const outputDir = opts.outputPath ?? join(projectPath, ARCHIVE_ROOT, 'generated_content')
  await mkdir(outputDir, { recursive: true })

  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `${timestamp}_${format}.md`
  const outputFile = join(outputDir, filename)

  await writeFile(outputFile, content, 'utf-8')

  return { outputFile, entryCount: entries.length, format }
}
