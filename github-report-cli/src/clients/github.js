import { DEFAULTS, fetchWithRetry, isTransientStatus } from "../utils.js";

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
    return new Error("GitHub authentication failed (401). Check your token.");
  }
  if (response.status === 404) {
    return new Error("Repository not found (404) or token lacks access.");
  }
  if (response.status === 403 || response.status === 429) {
    return new Error("GitHub rate limit reached. Wait and retry.");
  }

  return new Error(
    `GitHub API error ${response.status}: ${details || "Unknown error"}`,
  );
}

export async function fetchRepoBranches({
  owner,
  repo,
  token,
  maxBranches = 200,
}) {
  const branches = [];
  let page = 1;
  const perPage = 100;

  while (branches.length < maxBranches) {
    const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));

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

    branches.push(...pageItems);

    if (pageItems.length < perPage) {
      break;
    }

    page += 1;
  }

  return branches.slice(0, maxBranches);
}

export async function collectCommits({
  owner,
  repo,
  branch,
  author,
  since,
  until,
  token,
  maxCommits = DEFAULTS.maxCommits,
  onProgress,
}) {
  const commits = [];
  let page = 1;
  const perPage = 100;

  while (commits.length < maxCommits) {
    onProgress?.(`Fetching commit page ${page}...`);

    const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`);
    url.searchParams.set("sha", branch);
    url.searchParams.set("author", author);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    if (since) {
      url.searchParams.set("since", since);
    }
    if (until) {
      url.searchParams.set("until", until);
    }

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

  const capped = commits.slice(0, maxCommits);
  return {
    commits: capped,
    isCapped: commits.length > maxCommits,
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
