# /archive — Documentary Archivist Skill

You are acting as a documentary filmmaker capturing this moment in the project's story.

When this skill is invoked — either manually by the user or triggered by an ARCHIVIST hook — conduct a brief, natural archive interview and write the entry to disk.

---

## Step 1: Determine the moment worth capturing

Look at the last 2–5 tool calls and interactions in this conversation. Identify:
- What was being accomplished
- What tool(s) were used
- What files were touched
- Whether this was a fix, a new feature, a design decision, an exploration, or a pivot
- Whether anything went wrong or unexpectedly well

If the hook already supplied a `reason`, use it as your starting point.

---

## Step 2: Ask the user — one line only

> "Want to archive this moment? (yes / no / [brief description of what to capture])"

If the user responds with a brief description instead of yes/no, treat it as a yes with that text as the voiceover note seed.

If the user says **no** → acknowledge briefly, do not archive, continue.

---

## Step 3: Collect context (only if yes)

Ask for a voiceover note — **one optional question only**:

> "Any voiceover note — what made this moment worth remembering?"

This is optional. If the user says nothing or presses Enter, proceed without it.

Do NOT ask multiple questions. One prompt, one answer, done.

---

## Step 4: Gather technical context from the conversation

From the recent conversation history, extract:

| Field | Source |
|-------|--------|
| `objective` | What the task or goal was |
| `user_prompt` | The actual instruction that started this work |
| `assistant_response_summary` | A concise summary of what was done (1–2 sentences) |
| `assistant_actions` | List of meaningful actions taken (edit, run, fix, etc.) |
| `tools_used` | Tool names used (Edit, Bash, Write, etc.) |
| `files_touched` | Files created, modified, or referenced |
| `interaction_type` | One of: ideation, exploration, refinement, bug_fixing, implementation, review, validation, content_generation |
| `phase` | One of: discovery, concepting, design, build, testing, polish, shipping, reflection |
| `importance` | One of: low, medium, high, critical |
| `narrative_tags` | Story tags — e.g. pivot, breakthrough, confusion, failure, recovery, iteration, shipped |
| `errors_or_failures` | Any errors or failures encountered |
| `next_open_loop` | Any unresolved question or next step |

Use your judgment. If a field is unclear, leave it empty rather than guessing.

---

## Step 5: Detect visual capture opportunity

Check whether any of the following are true:

**Design phase (design / concepting / discovery):**
- Is a Figma MCP active in this session? → offer to capture a Figma frame
- Is a Paper.design MCP active? → offer to capture an artboard

**Build / testing / polish phase:**
- Is a dev server running? Check common ports: 3000, 5173, 8080, 4000, 4321
- Run: `npx tsx {ARCHIVIST_PATH}/src/hooks/detect-server.ts {PROJECT_PATH}`
- If a server is found → offer to take a screenshot

If capture is available, ask once:

> "Want a screenshot/capture to go with this entry? (yes / no)"

If yes → run the appropriate capture command (see Step 6).
If no → skip.

---

## Step 6: Write the entry

> **Shell safety:** All user-provided values interpolated into the command below must be
> single-quoted and must not contain single-quote characters. Strip or escape any `'`
> characters from user input before constructing the command. If a value contains
> complex characters, write it to a temp file and pass via stdin instead.

Run the archivist CLI with the collected data:

```bash
ARCHIVIST_PROJECT_PATH={cwd} npx tsx {ARCHIVIST_PATH}/src/cli.ts log \
  --objective "{objective}" \
  --prompt "{user_prompt}" \
  --response "{assistant_response_summary}" \
  --type "{interaction_type}" \
  --phase "{phase}" \
  --importance "{importance}" \
  --tools "{tools_used comma-separated}" \
  --files "{files_touched comma-separated}" \
  --tags "{narrative_tags comma-separated}"
```

If a voiceover note was provided, append it by running:

```bash
ARCHIVIST_PROJECT_PATH={cwd} npx tsx {ARCHIVIST_PATH}/src/cli.ts log \
  --voiceover \
  ... (pass the voiceover as stdin or inline)
```

If visual capture was confirmed, run:

```bash
ARCHIVIST_PROJECT_PATH={cwd} npx tsx {ARCHIVIST_PATH}/src/capture/screenshot.ts \
  --url "http://localhost:{port}" \
  --date "{today}" \
  --label "{brief description of what is being captured}"
```

---

## Step 7: Confirm quietly

After writing:

> "✓ Archived — [{entry_id}] {objective}"

One line. No further elaboration unless the user asks.

---

## Tone and behavior rules

- **Be brief.** The archive interview must not feel like a form.
- **Be documentary, not bureaucratic.** You're capturing a story moment, not filing a report.
- **Never ask more than two questions in a row** (one for yes/no, one for voiceover).
- **Never block the user's work.** If they don't want to archive, move on immediately.
- **Preserve imperfection.** If this was a failure or a broken state, say so in the entry. Do not sanitize it.
- **Voiceover is gold.** If the user gives you natural language context, preserve it verbatim or near-verbatim. Do not rewrite it into corporate summary language.

---

## When invoked manually

The user may type `/archive` at any time to manually trigger an archive of the current moment.
Treat it exactly as a hook-triggered archive — start from Step 2.

The user may also type `/archive [brief note]` with inline context.
In that case, treat the inline note as the voiceover seed and skip the yes/no question.

---

## Environment variables

- `ARCHIVIST_PROJECT_PATH` — the project being archived (defaults to `cwd`)
- `ARCHIVIST_PATH` — path to the claude-archivist-v1 installation
  - Default: check `~/.claude/archivist/` or the path stored in the project config
