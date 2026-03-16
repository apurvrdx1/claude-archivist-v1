/**
 * Visual capture orchestrator.
 * Decides which capture path is available based on:
 *   - Current project phase (design vs build)
 *   - Active MCP connections (Figma, Paper.design)
 *   - Running dev server (Playwright)
 *
 * Returns a CaptureContext that the /archive skill uses to offer
 * the right capture option to the user — one clear choice, not a menu.
 */
import { detectMcps, type McpPresence } from './mcp-detect.js'
import { captureWithPlaywright, type PlaywrightCaptureResult } from './playwright.js'
import { buildFigmaCaptureInstructions, figmaSkillFragment, paperSkillFragment } from './figma.js'
import { readConfig } from '../core/storage.js'
import { ProjectPhase } from '../core/schema.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CaptureMode = 'none' | 'playwright' | 'figma' | 'paper'

export interface CaptureContext {
  mode: CaptureMode
  available: boolean
  /** Human-readable summary for the skill prompt */
  description: string
  /** Prompt fragment for the /archive skill */
  skillFragment: string
  /** Detected MCP state */
  mcps: McpPresence
  /** Detected dev server URL (if any) */
  devServerUrl: string | null
}

export interface VisualCaptureResult {
  mode: CaptureMode
  artifactRefs: string[]
  success: boolean
  error?: string
}

// ─── Dev server detection ─────────────────────────────────────────────────────

async function detectDevServer(ports: number[]): Promise<string | null> {
  for (const port of ports) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 800)
      const res = await fetch(`http://localhost:${port}`, {
        method: 'HEAD',
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.status < 500) return `http://localhost:${port}`
    } catch {
      // Port not open — try next
    }
  }
  return null
}

// ─── Context builder ──────────────────────────────────────────────────────────

export async function buildCaptureContext(
  projectPath: string,
  claudeDir?: string
): Promise<CaptureContext> {
  const config = await readConfig(projectPath)
  const phase = config?.phase ?? ProjectPhase.build
  const ports = config?.capture?.devserver_ports ?? [3000, 5173, 8080, 4000, 4321]

  const mcps = await detectMcps(claudeDir)

  // Design phases: prefer MCP capture over Playwright
  const isDesignPhase = phase === ProjectPhase.design || phase === ProjectPhase.discovery

  if (isDesignPhase) {
    if (mcps.figma && mcps.figmaServerKey) {
      return {
        mode: 'figma',
        available: true,
        description: `Figma MCP connected (${mcps.figmaServerKey})`,
        skillFragment: figmaSkillFragment(mcps.figmaServerKey),
        mcps,
        devServerUrl: null,
      }
    }

    if (mcps.paper && mcps.paperServerKey) {
      return {
        mode: 'paper',
        available: true,
        description: `Paper.design MCP connected (${mcps.paperServerKey})`,
        skillFragment: paperSkillFragment(mcps.paperServerKey),
        mcps,
        devServerUrl: null,
      }
    }
  }

  // Build / polish / testing phases: use Playwright if dev server is running
  const devServerUrl = await detectDevServer(ports)

  if (devServerUrl) {
    return {
      mode: 'playwright',
      available: true,
      description: `Dev server at ${devServerUrl}`,
      skillFragment: buildPlaywrightSkillFragment(devServerUrl),
      mcps,
      devServerUrl,
    }
  }

  // Fallback: also offer Playwright for design phases if dev server found
  if (isDesignPhase) {
    const devUrl = await detectDevServer(ports)
    if (devUrl) {
      return {
        mode: 'playwright',
        available: true,
        description: `Dev server at ${devUrl} (no design MCP connected)`,
        skillFragment: buildPlaywrightSkillFragment(devUrl),
        mcps,
        devServerUrl: devUrl,
      }
    }
  }

  return {
    mode: 'none',
    available: false,
    description: 'No capture source available (no MCP, no dev server)',
    skillFragment: '',
    mcps,
    devServerUrl: null,
  }
}

// ─── Playwright capture entry point ──────────────────────────────────────────

export async function runPlaywrightCapture(opts: {
  projectPath: string
  date: string
  url: string
  description: string
  state?: string
  breakpoints?: number[]
}): Promise<VisualCaptureResult> {
  const config = await readConfig(opts.projectPath)
  const breakpoints = opts.breakpoints ?? config?.capture?.breakpoints ?? [375, 768, 1280]

  const result: PlaywrightCaptureResult = await captureWithPlaywright({
    url: opts.url,
    projectPath: opts.projectPath,
    date: opts.date,
    description: opts.description,
    state: opts.state,
    breakpoints,
  })

  return {
    mode: 'playwright',
    artifactRefs: result.artifactRefs,
    success: result.success,
    error: result.error,
  }
}

// ─── Skill prompt fragments ───────────────────────────────────────────────────

function buildPlaywrightSkillFragment(url: string): string {
  return [
    `**Dev server detected at ${url}**`,
    '',
    'To capture a screenshot:',
    '1. Ask the user: "Want a screenshot at this moment? (yes / no)"',
    '2. Optionally: "Any specific state to capture? (e.g. broken, fixed, hover)" — skip if obvious from context',
    '3. If yes → run:',
    '   ```bash',
    `   ARCHIVIST_PROJECT_PATH={cwd} npx tsx {ARCHIVIST_PATH}/src/capture/screenshot.ts \\`,
    `     --url "${url}" \\`,
    '     --date "{today}" \\',
    '     --description "{kebab-description}" \\',
    '     --state "{state-or-empty}"',
    '   ```',
    '4. Add returned artifact refs to the log entry.',
    '',
    '**Important:** also capture broken or incorrect states — they are valuable documentary material.',
  ].join('\n')
}

// ─── Figma capture instructions helper ───────────────────────────────────────

export { buildFigmaCaptureInstructions }
