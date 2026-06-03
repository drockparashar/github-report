# CommitBrief

CommitBrief turns GitHub commit history into decision-ready reports: release narratives, delivery recaps, client updates, audit evidence, and stakeholder briefs.

This repository contains three implementations of the commit intelligence workflow:

1. Browser app for single-repo interactive reporting
2. Terminal CLI for branch-scoped report generation
3. Weekly multi-repo service (Lambda-oriented structure)

## Project Structure

- `index.html`, `app.html`, `app.js`, `app.css`
  - Browser-based CommitBrief studio for single-repo report generation
- `github-report-cli/`
  - Node.js CLI for interactive or non-interactive report generation
- `github-report-weekly-service/`
  - Weekly multi-repo update service designed for Lambda + API Gateway + cron integration

## Current Stage

### 1) Web App (stable)

The browser app supports:

- repo + branch selection
- optional since/until filters
- compact payload preview
- configurable AI provider analysis for report sections, themes, and impact
- markdown copy + download

Run:

1. Open `index.html` in browser or VS Code Live Server.
2. Fill inputs, load branches, select a branch, and generate a commit intelligence brief.

### 2) CLI App (stable)

The CLI supports:

- branch selection (interactive or via flag)
- markdown output + optional JSON output
- retry/backoff and malformed batch handling

Run:

```bash
cd github-report-cli
node ./bin/report.js generate
```

For details, see `github-report-cli/README.md`.

### 3) Weekly Service (in progress)

The weekly service currently includes:

- multi-repo scan by weekly date range (no author filter)
- per-repo independent report generation
- Lambda-style handlers:
  - `api-generate`
  - `cron-weekly`
  - `get-status`
- local development job store and artifact output

Run locally:

```bash
cd github-report-weekly-service
node ./src/handlers/api-generate.js
```

For details, see `github-report-weekly-service/README.md`.

## Shared Pipeline Rules

Across implementations, the core report logic keeps these limits:

- max commits: 100 per repo scan
- max files: 8 per commit
- max patch chars: 500 per file
- max message chars: 300
- AI analysis batch size: 6 commits

Reliability behavior:

- transient GitHub/AI provider retry with exponential backoff
- malformed batch JSON is skipped (processing continues)
- final merge call is skipped if only one batch exists

## Next Planned Stage

For `github-report-weekly-service`:

1. Replace local job store with DynamoDB
2. Replace local report artifacts with S3
3. Add deployment IaC for Lambda, API Gateway, EventBridge, and IAM
