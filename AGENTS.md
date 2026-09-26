# Project Manifest

See `./manifest.md` for project metadata.

This file defines:
- `project_type`
- `project_priority`


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

### File deletion policy

Never permanently delete project files. When retiring code, docs, configs, or
other artifacts, move them to `.archive/` instead, preserving the original
relative path under the archive root (see
`news-digest-pipeline/.archive/README.md`). Do not use `rm`, `git rm`, or
permanent delete tools for cleanup — archive first.

### Dashboard UI

All pages in `news-digest-pipeline/src/public/` must fit the screen width. No horizontal page overflow: constrain the viewport, wrap long URLs and titles, and keep tables/toolbars inside the screen.

### Reel / Image Generation Instructions

When working on reel or image generation, read
`news-digest-pipeline/docs/reel-image-workflow.md` first.

When changing `news-digest-pipeline/production/lib` or adding tests, read
`news-digest-pipeline/docs/testing.md` and run tests from
`news-digest-pipeline/` (`npm run test:production` or `npm run test:all`).

### Running app is the NAS

The household app is the UGREEN container at http://127.0.0.1:3010
(`/volume1/docker/news-digest`, SSH `nas-user@127.0.0.1` port 122). The laptop
process on port 3000 is only a local preview.

After every application fix or code change (including small dashboard, pipeline,
production-lib, video/reel, and other server-loaded changes), deploy so the NAS
image matches this repo, then confirm health:

```bash
news-digest/scripts/deploy-nas.sh
curl -sS http://127.0.0.1:3010/health
```

`news-digest-pipeline/scripts/restart-local.sh` updates the laptop only. A local
`./restart.sh` wrapper at the git root is optional and gitignored. See
`news-digest-pipeline/docs/ugreen-docker.md`.

The required review-first CLI workflow is:

```bash
cd news-digest-pipeline
node production/video/src/generate-reel.js latest --copy-only
```

Wait for copy approval, then generate grounded 9:16 backgrounds:

```bash
node production/video/src/generate-reel.js latest --images-only
```

This reuses the saved storyboard so approved wording is not regenerated. Wait
for image approval before running:

```bash
node production/video/src/generate-reel.js latest
```

Use exactly one image per actual news block; derive the count dynamically from
the selected digest and never hard-code a story/image count. Preserve the reel
layout: no `Більше новин тут...` CTA and headline/detail in the upper 25%.
Keep all headlines, details, spoken text, and voice output Ukrainian (brand and
product names may remain in Latin script). **FROZEN:** `headline` 6–11 words,
one finished sentence; `detailText` exactly one finished sentence of 8–12
words; never cut on a comma, word cap, or dangling verb. Do not loosen these
bands. Do not use old carousel images or synthetic fallbacks.
