#!/usr/bin/env bash
# ─── claude-archivist installer ───────────────────────────────────────────────
# Installs the archivist skill and hooks into Claude Code's global config.
# Run once from the claude-archivist-v1 directory.
#
# Usage:
#   ./install.sh                    # Install skill + hooks globally
#   ./install.sh --project-only     # Only scaffold the current project (no global install)
#   ./install.sh --uninstall        # Remove archivist hooks from Claude Code config

set -euo pipefail

ARCHIVIST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1" >&2; }

# ─── Mode flags ───────────────────────────────────────────────────────────────

PROJECT_ONLY=false
UNINSTALL=false

for arg in "$@"; do
  case "$arg" in
    --project-only) PROJECT_ONLY=true ;;
    --uninstall)    UNINSTALL=true ;;
  esac
done

# ─── Uninstall ────────────────────────────────────────────────────────────────

if [ "$UNINSTALL" = true ]; then
  echo "Removing archivist hooks from Claude Code settings..."

  if [ -f "$SETTINGS_FILE" ]; then
    # Use node to surgically remove archivist hooks from settings.json
    node --input-type=module <<EOF
import { readFileSync, writeFileSync } from 'fs';
const settings = JSON.parse(readFileSync('${SETTINGS_FILE}', 'utf-8'));
if (settings.hooks) {
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = (settings.hooks[event] || []).filter(
      h => h._id !== 'claude-archivist:post-tool-use' && h._id !== 'claude-archivist:session-start'
    );
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}
writeFileSync('${SETTINGS_FILE}', JSON.stringify(settings, null, 2));
console.log('Hooks removed.');
EOF
    log "Archivist hooks removed from settings.json"
  fi

  # Remove skill
  if [ -f "${SKILLS_DIR}/archive.md" ]; then
    rm "${SKILLS_DIR}/archive.md"
    log "Removed skill: ~/.claude/skills/archive.md"
  fi

  echo ""
  echo "Archivist uninstalled. Your documentation_notes/ folders are untouched."
  exit 0
fi

# ─── Dependency checks ────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════"
echo "  claude-archivist installer"
echo "═══════════════════════════════════════════"
echo ""

if ! command -v node &>/dev/null; then
  err "Node.js is required. Install it from https://nodejs.org"
  exit 1
fi

if ! command -v npx &>/dev/null; then
  err "npx is required (comes with Node.js 5.2+)"
  exit 1
fi

log "Node.js found: $(node --version)"

# ─── Install npm dependencies ─────────────────────────────────────────────────

echo "Installing dependencies..."
(cd "$ARCHIVIST_DIR" && npm install --silent)
log "Dependencies installed"

# ─── Install skill ────────────────────────────────────────────────────────────

if [ "$PROJECT_ONLY" = false ]; then
  mkdir -p "$SKILLS_DIR"
  # Inject the resolved ARCHIVIST_PATH so the skill's bash commands work
  # without requiring the user to set an env var manually.
  sed "s|{ARCHIVIST_PATH}|${ARCHIVIST_DIR}|g" \
    "${ARCHIVIST_DIR}/skill/archive.md" > "${SKILLS_DIR}/archive.md"
  log "Skill installed: ~/.claude/skills/archive.md → /archive"
  log "  ARCHIVIST_PATH resolved to: ${ARCHIVIST_DIR}"
  warn "  Note: if you move this directory, re-run ./install.sh to update the path."
fi

# ─── Install hooks into Claude Code settings.json ─────────────────────────────

if [ "$PROJECT_ONLY" = false ]; then
  if [ ! -d "$CLAUDE_DIR" ]; then
    err "Claude Code does not appear to be installed (${CLAUDE_DIR} not found)."
    err "Install Claude Code first: https://claude.ai/download"
    exit 1
  fi
  if [ ! -f "$SETTINGS_FILE" ]; then
    warn "No Claude Code settings.json found — creating one."
    echo '{}' > "$SETTINGS_FILE"
  fi

  node --input-type=module <<EOF
import { readFileSync, writeFileSync } from 'fs';

const settingsPath = '${SETTINGS_FILE}';
const archivistPath = '${ARCHIVIST_DIR}';

const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

if (!settings.hooks) settings.hooks = {};

// PostToolUse hook — tool counter + completion signal detection
const postToolUseHook = {
  command: "node --input-type=module --eval \\"import { createRequire } from 'module'; const require = createRequire(import.meta.url); process.chdir('" + archivistPath + "'); import('" + archivistPath + "/src/hooks/post-tool-use.ts').catch(() => process.exit(0));\\"",
  matcher: ".*",
  description: "claude-archivist: completion signal detection"
};

// Hooks use a stable _id for precise install/uninstall targeting
const postToolUseHookTsx = {
  _id: "claude-archivist:post-tool-use",
  command: "npx --prefix '" + archivistPath + "' tsx '" + archivistPath + "/src/hooks/post-tool-use.ts'",
  description: "claude-archivist: completion signal detection"
};

const sessionStartHook = {
  _id: "claude-archivist:session-start",
  command: "npx --prefix '" + archivistPath + "' tsx '" + archivistPath + "/src/hooks/session-start.ts'",
  description: "claude-archivist: session-start check"
};

// Remove existing archivist hooks before re-adding (match by stable _id)
if (settings.hooks.PostToolUse) {
  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
    h => h._id !== 'claude-archivist:post-tool-use'
  );
}
if (settings.hooks.UserPromptSubmit) {
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
    h => h._id !== 'claude-archivist:session-start'
  );
}

// Add hooks
settings.hooks.PostToolUse = [...(settings.hooks.PostToolUse || []), postToolUseHookTsx];
settings.hooks.UserPromptSubmit = [...(settings.hooks.UserPromptSubmit || []), sessionStartHook];

writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log('Hooks written to settings.json');
EOF

  log "Hooks installed in Claude Code settings.json"
  log "  PostToolUse  → completion signal detection"
  log "  UserPromptSubmit → session-start archiving check"
fi

# ─── Store archivist path in Claude config ────────────────────────────────────

if [ "$PROJECT_ONLY" = false ]; then
  node --input-type=module <<EOF
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const claudeDir = '${CLAUDE_DIR}';
const archivistConfigPath = join(claudeDir, 'archivist.json');

const config = {
  archivist_path: '${ARCHIVIST_DIR}',
  installed_at: new Date().toISOString(),
  version: '1.0.0'
};

writeFileSync(archivistConfigPath, JSON.stringify(config, null, 2));
EOF
  log "Archivist path stored: ~/.claude/archivist.json"
fi

# ─── Project scaffold (optional) ──────────────────────────────────────────────

echo ""
read -p "Initialize archiving in the current directory ($(pwd))? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  read -p "Project name: " PROJECT_NAME
  ARCHIVIST_PROJECT_PATH="$(pwd)" npx --prefix "$ARCHIVIST_DIR" tsx "${ARCHIVIST_DIR}/src/cli.ts" init --name "$PROJECT_NAME"
  log "Project initialized"
else
  echo "  Skipped. Run 'archivist init' in any project directory to start archiving."
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════"
echo "  Installation complete"
echo "═══════════════════════════════════════════"
echo ""
echo "  Skill:    /archive  (available in all Claude Code sessions)"
echo "  Hooks:    PostToolUse + UserPromptSubmit  (auto-detecting pauses)"
echo "  CLI:      ARCHIVIST_PROJECT_PATH=\$(pwd) npx tsx ${ARCHIVIST_DIR}/src/cli.ts <command>"
echo ""
echo "  Commands:"
echo "    archivist init     Initialize a project"
echo "    archivist start    Open today's session"
echo "    archivist log      Add an entry manually"
echo "    archivist end      Close session with summary"
echo "    archivist status   Show current status"
echo ""
echo "  Restart Claude Code for hooks to take effect."
echo ""
