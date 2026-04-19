# GitHub Weekly Update Service

A separate Node.js service intended for Lambda + API Gateway + cron scheduling.

## What it does

1. Accepts a weekly date range (`startDate`, `endDate`).
2. Scans multiple configured repositories (without author filter).
3. Summarizes each repository independently using Gemini.
4. Writes one markdown weekly report per repository.
5. Tracks run status with per-repo success/failure details.

## Folder

`github-report-weekly-service`

## Configuration

Required environment variables:

- `GITHUB_TOKEN`
- `GEMINI_API_KEY`
- `REPORT_REPOS_JSON` (JSON array of repo objects)

Optional:

- `GEMINI_MODEL` (default: `gemini-2.5-flash`)
- `MAX_PARALLEL_REPOS` (default: 3)
- `REPORT_OUTPUT_DIR` (default: `artifacts`)

Example repo config:

```json
[
  { "owner": "org1", "repo": "repo-a" },
  { "owner": "org1", "repo": "repo-b", "branch": "main" }
]
```

## Handlers

- `src/handlers/api-generate.js`
  - Manual invocation with explicit date range.
- `src/handlers/cron-weekly.js`
  - Computes previous week range and triggers generation.
- `src/handlers/get-status.js`
  - Retrieves persisted job status by `jobId`.

## Local usage

```bash
cd github-report-weekly-service
node ./src/handlers/api-generate.js
```

For status lookup:

```bash
node ./src/handlers/get-status.js <jobId>
```

## Current stage

This implementation is Lambda-ready in structure, but storage/status currently use local filesystem for development (`artifacts/`, `.local-jobs/`).

Next stage for cloud deployment:

1. Replace filesystem job store with DynamoDB.
2. Replace local artifacts with S3 uploads.
3. Add IAM + API Gateway + EventBridge IaC.
