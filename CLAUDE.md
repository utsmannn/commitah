# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run start        # Run without building (uses tsx)
npm run wizard       # Run configuration wizard directly
npm run assemble     # Build and run
```

## Architecture

Commitah is a CLI tool that generates AI-powered git commit messages. It uses the OpenAI SDK with configurable base URLs to support multiple AI providers.

### Core Flow

1. **main.ts** - Entry point, parses CLI args (`--config`, `--config-update`, `--show`)
2. **script.ts** - Core logic:
   - `getGitDiff()` - Gets staged changes via `git diff --staged`
   - `generateCommitMessages()` - Sends diff to AI provider using OpenAI SDK
   - Uses Zod schema (`CommitMessage`) for structured AI response parsing
3. **commit-ui.ts** - Interactive commit message selector using blessed
4. **wizard.ts** - Configuration wizard with template-based URL selection
5. **config.ts** - Manages `~/.commitahconfig-v2` JSON file
6. **updater.ts** - Checks npm registry for updates

### Key Patterns

- All AI providers use OpenAI-compatible endpoints via the `openai` SDK with custom `baseURL`
- Wizard stores URL templates with provider name, base URL, default model, and API key requirement
- Config wizard supports `v` key to open config file in vim/`$EDITOR`
- Uses `blessed` for terminal UI components (radio buttons, textboxes, buttons)
- Uses `zx` for shell command execution (`$` template literal)

### Configuration

Config file: `~/.commitahconfig-v2`

```json
{
  "provider": "OpenAI",
  "providerUrl": "https://api.openai.com/v1",
  "providerApiKey": "...",
  "model": "gpt-4o",
  "messageSpec": "conventional commit",
  "sizeOption": 3
}
```

### Supported Providers (in wizard.ts)

OpenAI, Anthropic, Gemini, DeepSeek, Groq, Mistral, Together, Fireworks, OpenRouter, Cerebras, GLM, Ollama, Custom


## This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

### Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

