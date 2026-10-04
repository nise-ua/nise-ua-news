---
name: dashboard-reality-check
description: >-
  Runs the dashboard reality-check Vitest file for health, viewport overflow,
  and primary controls. Use only when the user names dashboard-reality-check,
  a dashboard reality check, or NAS dashboard QA.
disable-model-invocation: true
---

# Dashboard reality check

The check lives in [`news-digest-pipeline/src/public/dashboard-reality-check.test.js`](../../../news-digest-pipeline/src/public/dashboard-reality-check.test.js). Do not reimplement it in the browser, and do not import agency-agents.

From `news-digest-pipeline/`:

```bash
npx vitest run src/public/dashboard-reality-check.test.js
```

That serves the dashboard pages locally, checks `/health`, desktop `1280x800` and phone `390x844` overflow, and the primary controls. It does not create a digest, save settings, delete articles, or publish.

Screenshots and `report.md` land in `news-digest-pipeline/output/qa/dashboard-reality-check/` (gitignored).

To run the same assertions against the NAS app:

```bash
DASHBOARD_BASE_URL="$NEWS_DIGEST_URL" npx vitest run src/public/dashboard-reality-check.test.js
```

Report the Vitest result and that folder path. Do not change digest voice, reel copy, or image grounding.
