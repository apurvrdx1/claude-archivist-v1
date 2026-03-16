import { describe, it, expect } from 'vitest'
import { buildArtifactName, parseArtifactSequence, buildArtifactRef } from './artifact.js'

describe('buildArtifactName', () => {
  it('builds a correctly formatted artifact name', () => {
    const name = buildArtifactName(1, 'hero-layout', 'broken', 'png')
    expect(name).toBe('001_hero-layout_broken.png')
  })

  it('zero-pads sequence to 3 digits', () => {
    expect(buildArtifactName(1, 'test', 'state', 'png')).toMatch(/^001_/)
    expect(buildArtifactName(9, 'test', 'state', 'png')).toMatch(/^009_/)
    expect(buildArtifactName(10, 'test', 'state', 'png')).toMatch(/^010_/)
    expect(buildArtifactName(99, 'test', 'state', 'png')).toMatch(/^099_/)
  })

  it('slugifies the description', () => {
    const name = buildArtifactName(1, 'Hero Section Layout', 'initial draft', 'png')
    expect(name).toBe('001_hero-section-layout_initial-draft.png')
  })

  it('removes special characters from description', () => {
    const name = buildArtifactName(2, 'hero (mobile)', 'broken!', 'png')
    expect(name).toBe('002_hero-mobile_broken.png')
  })

  it('supports different extensions', () => {
    expect(buildArtifactName(1, 'frame', 'export', 'jpg')).toBe('001_frame_export.jpg')
    expect(buildArtifactName(1, 'frame', 'export', 'webp')).toBe('001_frame_export.webp')
  })

  it('omits state segment when state is empty', () => {
    const name = buildArtifactName(3, 'landing-page', '', 'png')
    expect(name).toBe('003_landing-page.png')
  })
})

describe('parseArtifactSequence', () => {
  it('returns 0 for an empty artifacts directory', () => {
    const seq = parseArtifactSequence([])
    expect(seq).toBe(0)
  })

  it('returns the highest sequence number found', () => {
    const files = [
      '001_hero_broken.png',
      '002_hero_fixed.png',
      '003_mobile_broken.png',
    ]
    const seq = parseArtifactSequence(files)
    expect(seq).toBe(3)
  })

  it('ignores non-artifact files', () => {
    const files = ['.DS_Store', 'readme.txt', '001_hero_broken.png']
    const seq = parseArtifactSequence(files)
    expect(seq).toBe(1)
  })

  it('handles a single file', () => {
    expect(parseArtifactSequence(['005_test_state.png'])).toBe(5)
  })
})

describe('buildArtifactRef', () => {
  it('builds a relative artifact reference path', () => {
    const ref = buildArtifactRef('2026-03-16', '001_hero_broken.png')
    expect(ref).toBe('artifacts/001_hero_broken.png')
  })
})
