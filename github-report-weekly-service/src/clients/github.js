import { DEFAULTS } from "../config/defaults.js";
import { fetchWithRetry, isTransientStatus } from "../utils/common.js";

const GITHUB_API_BASE = "https://api.github.com";

function buildGitHubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `token ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function toGitHubError(response) {
  let details = "";
  try {
    const body = await response.json();
    details = body?.message || "";
  } catch {
    details = "";
  }

  if (response.status === 401) {
    return new Error("GitHub authentication failed (401). Check token.");
  }
  if (response.status === 404) {
    return new Error("Repository not found (404) or no access.");
  }
  if (response.status === 403 || response.status === 429) {
    return new Error("GitHub rate limit reached. Retry later.");
  }

  return new Error(
    `GitHub API error ${response.status}: ${details || "Unknown error"}`,
  );
}

export async function fetchRepositoryInfo({ owner, repo, token }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
  const res = await fetchWithRetry(
    url,
    { headers: buildGitHubHeaders(token) },
    {
      shouldRetryStatus: (status) =>
        isTransientStatus(status) || status === 403,
    },
  );

  if (!res.ok) {
    throw await toGitHubError(res);
  }

  return res.json();
}

export async function collectCommitsForRepo({
  owner,
  repo,
  branch,
  since,
  until,
  token,
  onProgress,
}) {
  const commits = [];
  let page = 1;
  const perPage = 100;

  while (commits.length < DEFAULTS.maxCommitsPerRepo) {
    onProgress?.(`Fetching ${owner}/${repo} commits page ${page}...`);

    const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`);
    if (branch) {
      url.searchParams.set("sha", branch);
    }
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("since", since);
    url.searchParams.set("until", until);

    const res = await fetchWithRetry(
      url,
      { headers: buildGitHubHeaders(token) },
      {
        shouldRetryStatus: (status) =>
          isTransientStatus(status) || status === 403,
      },
    );

    if (!res.ok) {
      throw await toGitHubError(res);
    }

    const pageItems = await res.json();
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }

    commits.push(...pageItems);

    if (pageItems.length < perPage) {
      break;
    }

    page += 1;
  }

  return {
    commits: commits.slice(0, DEFAULTS.maxCommitsPerRepo),
    isCapped: commits.length > DEFAULTS.maxCommitsPerRepo,
  };
}

export async function fetchCommitDetails({ owner, repo, sha, token }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${sha}`;
  const res = await fetchWithRetry(
    url,
    { headers: buildGitHubHeaders(token) },
    {
      shouldRetryStatus: (status) =>
        isTransientStatus(status) || status === 403,
    },
  );

  if (!res.ok) {
    throw await toGitHubError(res);
  }

  return res.json();
}
