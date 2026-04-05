# Internship Work Report Generator

A single-page web app that:

1. Fetches your commits from GitHub.
2. Pulls commit-level diff patches.
3. Sends compact commit summaries to Gemini 1.5 Flash in batches.
4. Merges and deduplicates extracted features.
5. Renders feature cards and exports a Markdown internship report.

## Stack

- HTML
- CSS
- Vanilla JavaScript
- GitHub REST API
- Gemini 1.5 Flash API

## Run

Open `index.html` in a browser or run via VS Code Live Server.

No build step and no dependencies are required.

## Inputs

- GitHub PAT
- Gemini API key
- Repo URL or `owner/repo`
- GitHub username (author filter)
- Since date (optional)

## Notes

- Commit list is capped at 100 (latest). Use Since Date to narrow results.
- Commit files are capped at 8 per commit.
- Patch text is capped at 500 characters per file.
- Commit message is capped at 300 characters.
- Batching uses 6 commits per Gemini call.
- If a batch returns malformed JSON, that batch is skipped and processing continues.

## Common Errors

- `401`: invalid GitHub token
- `404`: repo not found or no access
- `403/429`: rate limit reached

## Security Reminder

This is currently browser-only. API keys are entered in the UI and used directly from the client. For public deployment, move API calls to a backend proxy.
