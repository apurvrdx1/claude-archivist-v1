import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildFigmaCaptureInstructions,
  saveFigmaArtifact,
  figmaSkillFragment,
  paperSkillFragment,
} from './figma.js'
import { scaffoldProjectArchive, ensureDayFolder } from '../core/storage.js'
import { getDefaultConfig } from '../core/schema.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'archivist-figma-test-'))
  await scaffoldProjectArchive(tmpDir, { ...getDefaultConfig(), project_name: 'test', archiving: true })
  await ensureDayFolder(tmpDir, '2026-03-16')
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ─── buildFigmaCaptureInstructions ────────────────────────────────────────────

describe('buildFigmaCaptureInstructions', () => {
  it('returns an object with prompt and context', () => {
    const result = buildFigmaCaptureInstructions({ description: 'hero section' })
    expect(result.prompt).toBeTruthy()
    expect(result.context).toBeTruthy()
  })

  it('includes the frame hint in the prompt when provided', () => {
    const result = buildFigmaCaptureInstructions({
      description: 'hero section',
      frameHint: 'mobile nav',
    })
    expect(result.prompt).toContain('mobile nav')
  })

  it('includes the file hint in the prompt when provided', () => {
    const result = buildFigmaCaptureInstructions({
      description: 'landing page',
      fileHint: 'Portfolio 2026',
    })
    expect(result.prompt).toContain('Portfolio 2026')
  })

  it('uses generic language when no hints are provided', () => {
    const result = buildFigmaCaptureInstructions({ description: 'something' })
    expect(result.prompt).toContain('most recently discussed')
  })

  it('includes PNG format instruction', () => {
    const result = buildFigmaCaptureInstructions({ description: 'test' })
    expect(result.prompt).toContain('PNG')
  })
})

// ─── saveFigmaArtifact ────────────────────────────────────────────────────────

describe('saveFigmaArtifact', () => {
  it('saves image buffer to artifacts directory', async () => {
    const fakeImage = Buffer.from('PNG_FAKE_DATA')
    const result = await saveFigmaArtifact({
      projectPath: tmpDir,
      date: '2026-03-16',
      description: 'hero-frame',
      state: 'figma-export',
      imageBuffer: fakeImage,
    })
    expect(result.success).toBe(true)
    expect(result.filename).toContain('hero-frame')
    expect(result.filename).toContain('figma-export')
    expect(result.artifactRef).toContain('artifacts/')
  })

  it('returns a filename with correct extension', async () => {
    const result = await saveFigmaArtifact({
      projectPath: tmpDir,
      date: '2026-03-16',
      description: 'nav-component',
      imageBuffer: Buffer.from('data'),
    })
    expect(result.filename).toMatch(/\.png$/)
  })

  it('returns an artifact ref with artifacts/ prefix', async () => {
    const result = await saveFigmaArtifact({
      projectPath: tmpDir,
      date: '2026-03-16',
      description: 'test-frame',
      imageBuffer: Buffer.from('data'),
    })
    expect(result.artifactRef).toMatch(/^artifacts\//)
  })

  it('sequences artifacts correctly across multiple saves', async () => {
    const r1 = await saveFigmaArtifact({
      projectPath: tmpDir,
      date: '2026-03-16',
      description: 'frame-one',
      imageBuffer: Buffer.from('data1'),
    })
    const r2 = await saveFigmaArtifact({
      projectPath: tmpDir,
      date: '2026-03-16',
      description: 'frame-two',
      imageBuffer: Buffer.from('data2'),
    })
    // Second artifact should have a higher sequence number
    const seq1 = parseInt(r1.filename.slice(0, 3), 10)
    const seq2 = parseInt(r2.filename.slice(0, 3), 10)
    expect(seq2).toBeGreaterThan(seq1)
  })
})

// ─── figmaSkillFragment / paperSkillFragment ──────────────────────────────────

describe('figmaSkillFragment', () => {
  it('returns a non-empty string', () => {
    const frag = figmaSkillFragment('figma')
    expect(typeof frag).toBe('string')
    expect(frag.length).toBeGreaterThan(0)
  })

  it('includes the server key', () => {
    const frag = figmaSkillFragment('my-figma-server')
    expect(frag).toContain('my-figma-server')
  })

  it('mentions Figma MCP', () => {
    const frag = figmaSkillFragment('figma')
    expect(frag.toLowerCase()).toContain('figma')
  })
})

describe('paperSkillFragment', () => {
  it('returns a non-empty string', () => {
    const frag = paperSkillFragment('paper')
    expect(frag.length).toBeGreaterThan(0)
  })

  it('includes the server key', () => {
    const frag = paperSkillFragment('paper-design-server')
    expect(frag).toContain('paper-design-server')
  })
})
