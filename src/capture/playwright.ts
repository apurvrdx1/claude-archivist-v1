/**
 * Playwright-based screenshot capture.
 * Captures the UI at one or more breakpoints and saves artifacts to the
 * daily artifacts directory. Handles both correct and broken states —
 * broken states are valuable documentary material.
 */
import { chromium } from 'playwright'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getArtifactsPath } from '../core/storage.js'
import { buildArtifactName, buildArtifactRef, nextArtifactSequence } from './artifact.js'

export interface BreakpointCapture {
  width: number
  filename: string
  artifactRef: string
  url: string
  success: boolean
  error?: string
}

export interface PlaywrightCaptureOptions {
  url: string
  projectPath: string
  date: string
  description: string
  state?: string             // e.g. "broken", "fixed", "initial"
  breakpoints?: number[]     // defaults to [375, 768, 1280]
  fullPage?: boolean
}

export interface PlaywrightCaptureResult {
  captures: BreakpointCapture[]
  artifactRefs: string[]
  success: boolean
  error?: string
}

const DEFAULT_BREAKPOINTS = [375, 768, 1280]

// ─── Main capture function ────────────────────────────────────────────────────

export async function captureWithPlaywright(
  opts: PlaywrightCaptureOptions
): Promise<PlaywrightCaptureResult> {
  const breakpoints = opts.breakpoints ?? DEFAULT_BREAKPOINTS
  const state = opts.state ?? ''
  const artifactsPath = getArtifactsPath(opts.projectPath, opts.date)
  const captures: BreakpointCapture[] = []
  const artifactRefs: string[] = []

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (err) {
    return {
      captures: [],
      artifactRefs: [],
      success: false,
      error: `Failed to launch browser: ${String(err)}`,
    }
  }

  try {
    for (const width of breakpoints) {
      const seq = await nextArtifactSequence(opts.projectPath, opts.date)
      const stateWithBreakpoint = state
        ? `${state}-${width}px`
        : `${width}px`
      const filename = buildArtifactName(seq, opts.description, stateWithBreakpoint, 'png')
      const outputPath = join(artifactsPath, filename)
      const ref = buildArtifactRef(opts.date, filename)

      try {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
        })
        const page = await context.newPage()

        await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 15000 })
        // Brief pause to let any CSS transitions settle
        await page.waitForTimeout(300)

        const screenshot = await page.screenshot({
          fullPage: opts.fullPage ?? false,
          type: 'png',
        })

        await writeFile(outputPath, screenshot)
        await context.close()

        captures.push({ width, filename, artifactRef: ref, url: opts.url, success: true })
        artifactRefs.push(ref)
      } catch (err) {
        // Capture the error but continue with remaining breakpoints
        // A failed capture at one breakpoint doesn't invalidate the others
        captures.push({
          width,
          filename,
          artifactRef: ref,
          url: opts.url,
          success: false,
          error: String(err),
        })
      }
    }
  } finally {
    await browser.close()
  }

  const anySuccess = captures.some(c => c.success)
  return { captures, artifactRefs, success: anySuccess }
}

// ─── Single-URL convenience capture ──────────────────────────────────────────

export async function captureSingleBreakpoint(
  url: string,
  width: number,
  outputPath: string
): Promise<{ success: boolean; error?: string }> {
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(300)
    const screenshot = await page.screenshot({ type: 'png' })
    await writeFile(outputPath, screenshot)
    await context.close()
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  } finally {
    await browser?.close()
  }
}
