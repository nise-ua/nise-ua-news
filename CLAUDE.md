# News Digest Pipeline

## Project Description
Collecting news from Perplexity via a Chrome extension (folder `extension/`) and processing them into author Facebook digests in Ukrainian.

## File Paths
- **Input Files**: `./input_*.json` — JSON files from the extension.
- **Output Files**: `./output/` — finished digests (`digest_YYYY-MM-DD_partN.txt`).
- **Commentary Style**: `./prompt.md`
- **Assembly Format**: `./assembly_prompt.md`
- **Settings (hashtags, border)**: `./config.md`
- **Reel/image workflow**: `./docs/reel-image-workflow.md`
- **How to run tests (agents)**: `./news-digest-pipeline/docs/testing.md`

## Processing Flow
1. User uploads `input_*.json`.
2. Verify content quality (filter sidebar noise).
3. Split into parts as directed by the user (usually 13-17 articles per part).
4. For each part, generate a digest according to the rules in `prompt.md` and `assembly_prompt.md`.
5. Save result to `./output/`.

## Reel and Image Generation

For reel/image tasks, read `news-digest-pipeline/docs/reel-image-workflow.md`
before running commands. Review fresh reel backgrounds first:

```bash
cd news-digest-pipeline
node production/video/src/generate-reel.js latest --images-only
```

Only after approval, generate the full reel:

```bash
node production/video/src/generate-reel.js latest
```

The reel uses factual visual grounding, exactly one image per actual news
block (dynamic count; never hard-code a story/image count), native 9:16
backgrounds, no `Більше новин тут...` CTA, and headline/detail in the upper 25%
of the frame. Headlines, details, spoken text, and voice output must be
Ukrainian; brand and product names may remain in Latin script. Do not run the
full reel when the user asks only for image review.

**FROZEN overlay copy:** `headline` 6–11 words, one finished sentence;
`detailText` exactly one finished sentence of 8–12 words; no dangling clauses;
no mid-sentence truncation. Do not loosen. See
`news-digest-pipeline/docs/reel-image-workflow.md`.

## Tests

Before/after `production/lib` changes, read
`news-digest-pipeline/docs/testing.md` and run from `news-digest-pipeline/`:

```bash
cd news-digest-pipeline
npm run test:production
```

Full gate: `npm run test:all`. New production-lib tests go in
`production/lib/__tests__/` (Vitest). Do not add new `node:test` files.

## Dashboard UI

All web pages in `news-digest-pipeline/src/public/` (`index.html`, `articles.html`, `settings.html`) must fit the screen width. No page may be wider than the viewport: constrain `html`/`body`, wrap or break long URLs and titles, and never let tables or toolbars cause horizontal page overflow.

## Digest Format
- `#новини` at the beginning (own line).
- Numbered author commentaries + link to original, starting with `1.` on the next line.
- Border/disclaimer (from `config.md`) at the end. No template or auto-generated trailing hashtags.


### Subagent Task Delegation

When receiving a task from a user — first evaluate:
- **Self:** quick fixes (< 2 min), discussions, analysis, questions, small fixes.
- **Subagent:** code > 50 lines, new modules, refactoring, UI changes, research, any tasks > 5 min.

When delegating to a subagent:
- Create a detailed task description with context, files to read, and expected results.
- Run in the background.
- Inform the user that it has been started.
- Upon completion — provide a brief report on the result.
- Multiple subagents can be run in parallel for independent tasks.

Goal: maximum parallelism and minimal user waiting time.

## Autonomy

The agent is fully autonomous within this project. All decisions regarding code, architecture, testing, security, and quality are made independently without requesting confirmation from the user.

**Involve the user only when:**
- Credentials or access to external services (VPS, API keys, tokens) are needed.
- Connecting to a remote server.
- Final demonstration of the result.
- Ambiguous product decisions (not technical).
