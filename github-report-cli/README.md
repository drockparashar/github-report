# GitHub Weekly Update CLI

Terminal version of the weekly engineering update generator.

## What it does

1. Reads GitHub commits from a selected branch.
2. Pulls commit details and compacts each commit payload.
3. Sends batches to Gemini 2.5 Flash for feature extraction.
4. Merges and deduplicates features.
5. Writes a Markdown report to disk.

## Requirements

- Node.js 18+
- GitHub PAT
- Gemini API key

## Quick start

```bash
cd github-report-cli
node ./bin/report.js generate
```

You can also provide secrets via environment variables:

```bash
# PowerShell
$env:GITHUB_TOKEN = "ghp_..."
$env:GEMINI_API_KEY = "AIza..."
```

## Non-interactive example

```bash
node ./bin/report.js generate \
  --repo owner/repo \
  --author your-username \
  --branch main \
  --since 2024-01-01 \
  --until 2024-04-30 \
  --output weekly-update.md \
  --json-output weekly-update.json \
  --non-interactive
```

## Notes

- Branch selection is mandatory; interactive mode lets you choose after branches are fetched.
- Commit list is capped at 100.
- Commit compaction rules:
  - sha: first 7 chars
  - message: max 300 chars
  - files: max 8 per commit
  - patch: max 500 chars per file
- Batching uses 6 commits per Gemini call.
- If only one batch exists, merge call is skipped.
- Malformed batch JSON is skipped and processing continues.
- GitHub and Gemini transient failures are retried with exponential backoff.

## Help

```bash
node ./bin/report.js --help
```
