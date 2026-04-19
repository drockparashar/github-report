import { DEFAULTS } from "./defaults.js";
import { normalizeDateEnd, normalizeDateStart } from "../utils/date-range.js";

function parseReposFromJson(rawReposJson) {
  if (!rawReposJson) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(rawReposJson);
  } catch {
    throw new Error("REPORT_REPOS_JSON must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("REPORT_REPOS_JSON must be a JSON array.");
  }

  return parsed.map((repo) => ({
    owner: repo.owner,
    repo: repo.repo,
    branch: repo.branch,
  }));
}

export function buildRuntimeConfig({ event, env = process.env }) {
  let parsedBody;
  if (typeof event?.body === "string") {
    try {
      parsedBody = JSON.parse(event.body || "{}");
    } catch {
      throw new Error("Request body must be valid JSON.");
    }
  }

  const body = parsedBody || event?.body || event || {};

  const configuredRepos = parseReposFromJson(env.REPORT_REPOS_JSON);
  const requestedRepos = Array.isArray(body.repos)
    ? body.repos
    : configuredRepos;

  if (!Array.isArray(requestedRepos) || requestedRepos.length === 0) {
    throw new Error(
      "No repositories configured. Provide repos in payload or REPORT_REPOS_JSON.",
    );
  }

  if (requestedRepos.length > DEFAULTS.maxReposPerRun) {
    throw new Error(
      `Too many repos in one run. Max allowed is ${DEFAULTS.maxReposPerRun}.`,
    );
  }

  const startIso = body.startDate
    ? normalizeDateStart(body.startDate)
    : body.startIso;
  const endIso = body.endDate ? normalizeDateEnd(body.endDate) : body.endIso;

  if (!startIso || !endIso) {
    throw new Error(
      "Both start and end date are required (startDate/endDate).",
    );
  }

  const githubToken = env.GITHUB_TOKEN;
  const geminiKey = env.GEMINI_API_KEY;

  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is required.");
  }
  if (!geminiKey) {
    throw new Error("GEMINI_API_KEY is required.");
  }

  return {
    repos: requestedRepos,
    startIso,
    endIso,
    githubToken,
    geminiKey,
    geminiModel: env.GEMINI_MODEL || DEFAULTS.geminiModel,
    maxParallelRepos: Number(
      env.MAX_PARALLEL_REPOS || DEFAULTS.maxParallelRepos,
    ),
    reportOutputDir: env.REPORT_OUTPUT_DIR || DEFAULTS.reportOutputDir,
  };
}
