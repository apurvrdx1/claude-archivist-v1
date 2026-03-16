import { mkdir, readFile, writeFile, access, appendFile } from 'fs/promises'
import { join } from 'path'
import { constants } from 'fs'
import { encodeToon, decodeToon } from './toon.js'
import { type ArchivistConfig, validateConfig, ARCHIVE_ROOT } from './schema.js'

// ─── Constants ────────────────────────────────────────────────────────────────
const RECORDS_DIR = 'records'
const GENERATED_DIR = 'generated_content'
const CONFIG_FILE = 'archivist.config.toon'
const LOG_FILE = 'daily_log.toon'
const ARTIFACTS_DIR = 'artifacts'

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function getArchiveRoot(projectPath: string): string {
  return join(projectPath, ARCHIVE_ROOT)
}

export function getDayFolderPath(projectPath: string, date: string): string {
  return join(projectPath, ARCHIVE_ROOT, RECORDS_DIR, date)
}

export function getLogPath(projectPath: string, date: string): string {
  return join(getDayFolderPath(projectPath, date), LOG_FILE)
}

export function getArtifactsPath(projectPath: string, date: string): string {
  return join(getDayFolderPath(projectPath, date), ARTIFACTS_DIR)
}

export function getConfigPath(projectPath: string): string {
  return join(projectPath, CONFIG_FILE)
}

export function getGeneratedPath(projectPath: string): string {
  return join(projectPath, ARCHIVE_ROOT, GENERATED_DIR)
}

// ─── Date validation ──────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function assertValidDate(date: string): void {
  if (!DATE_RE.test(date)) {
    throw new Error(`Invalid date format: "${date}". Expected YYYY-MM-DD.`)
  }
}

// ─── Existence checks ─────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function configExists(projectPath: string): Promise<boolean> {
  return fileExists(getConfigPath(projectPath))
}

// ─── Scaffold ─────────────────────────────────────────────────────────────────

export async function scaffoldProjectArchive(
  projectPath: string,
  config: ArchivistConfig
): Promise<void> {
  // Create directory structure
  await mkdir(join(projectPath, ARCHIVE_ROOT, RECORDS_DIR), { recursive: true })
  await mkdir(join(projectPath, ARCHIVE_ROOT, GENERATED_DIR), { recursive: true })

  // Write config
  await writeConfig(projectPath, config)

  // Update .gitignore
  await updateGitignore(projectPath)
}

async function updateGitignore(projectPath: string): Promise<void> {
  const gitignorePath = join(projectPath, '.gitignore')
  const exists = await fileExists(gitignorePath)

  if (!exists) return

  const content = await readFile(gitignorePath, 'utf-8')
  if (content.includes(ARCHIVE_ROOT)) return

  const addition = content.endsWith('\n')
    ? `${content}${ARCHIVE_ROOT}\n`
    : `${content}\n${ARCHIVE_ROOT}\n`

  await writeFile(gitignorePath, addition, 'utf-8')
}

// ─── Day folder ───────────────────────────────────────────────────────────────

export async function ensureDayFolder(projectPath: string, date: string): Promise<void> {
  assertValidDate(date)
  await mkdir(getDayFolderPath(projectPath, date), { recursive: true })
  await mkdir(getArtifactsPath(projectPath, date), { recursive: true })
}

// ─── Config I/O ───────────────────────────────────────────────────────────────

export async function writeConfig(projectPath: string, config: ArchivistConfig): Promise<void> {
  const toon = encodeToon(config as unknown as Record<string, import('./toon.js').ToonValue>)
  await writeFile(getConfigPath(projectPath), toon, 'utf-8')
}

export async function readConfig(projectPath: string): Promise<ArchivistConfig | null> {
  const configPath = getConfigPath(projectPath)
  const exists = await fileExists(configPath)
  if (!exists) return null

  const raw = await readFile(configPath, 'utf-8')
  const parsed = decodeToon(raw)

  if (!validateConfig(parsed)) return null
  return parsed as unknown as ArchivistConfig
}

// ─── Log I/O ──────────────────────────────────────────────────────────────────

export async function appendToLog(
  projectPath: string,
  date: string,
  content: string
): Promise<void> {
  assertValidDate(date)
  const logPath = getLogPath(projectPath, date)
  // Use appendFile (O_APPEND flag) for atomicity — avoids TOCTOU race
  // when multiple tool invocations write entries in the same session.
  // Each entry is preceded by \n\n so they are visually separated regardless
  // of whether the file previously existed or ended with a newline.
  await appendFile(logPath, '\n' + content + '\n', 'utf-8')
}

export async function readLog(projectPath: string, date: string): Promise<string> {
  assertValidDate(date)
  const logPath = getLogPath(projectPath, date)
  const exists = await fileExists(logPath)
  if (!exists) return ''
  return readFile(logPath, 'utf-8')
}
