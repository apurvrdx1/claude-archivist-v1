/**
 * Dev server detection utility.
 * Checks common localhost ports to find a running dev server.
 * Outputs JSON to stdout: { found: boolean, port: number | null, url: string | null }
 *
 * Usage: npx tsx detect-server.ts [project-path]
 */
import { readConfig } from '../core/storage.js'

const DEFAULT_PORTS = [3000, 5173, 8080, 4000, 4321, 4200, 8000, 8888]

interface DetectResult {
  found: boolean
  port: number | null
  url: string | null
}

async function checkPort(port: number): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 800)

    const response = await fetch(`http://localhost:${port}`, {
      signal: controller.signal,
      method: 'HEAD',
    })

    clearTimeout(timeout)
    return response.status < 500
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  const projectPath = process.argv[2] ?? process.cwd()

  // Read project config for custom ports
  const config = await readConfig(projectPath)
  const ports = config?.capture?.devserver_ports ?? DEFAULT_PORTS

  for (const port of ports) {
    const alive = await checkPort(port)
    if (alive) {
      const result: DetectResult = {
        found: true,
        port,
        url: `http://localhost:${port}`,
      }
      process.stdout.write(JSON.stringify(result))
      process.exit(0)
    }
  }

  const result: DetectResult = { found: false, port: null, url: null }
  process.stdout.write(JSON.stringify(result))
  process.exit(0)
}

main().catch(() => {
  const result: DetectResult = { found: false, port: null, url: null }
  process.stdout.write(JSON.stringify(result))
  process.exit(0)
})
