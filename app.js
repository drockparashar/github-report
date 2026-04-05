const GITHUB_API_BASE = "https://api.github.com";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_COMMITS = 100;
const COMMIT_FILES_LIMIT = 8;
const PATCH_LIMIT = 500;
const MESSAGE_LIMIT = 300;
const BATCH_SIZE = 6;
const COMMIT_FETCH_DELAY_MS = 100;
const PREVIEW_COMMIT_LIMIT = 12;
const RETRY_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;
const STORAGE_KEYS = {
  githubToken: "report.githubToken",
  geminiKey: "report.geminiKey",
};

const appState = {
  running: false,
  currentReport: null,
  lastError: null,
};

const els = {
  form: document.getElementById("report-form"),
  githubToken: document.getElementById("github-token"),
  geminiKey: document.getElementById("gemini-key"),
  repoUrl: document.getElementById("repo-url"),
  author: document.getElementById("author-username"),
  sinceDate: document.getElementById("since-date"),
  untilDate: document.getElementById("until-date"),
  inlineNote: document.getElementById("inline-note"),
  generateBtn: document.getElementById("generate-btn"),
  statusText: document.getElementById("status-text"),
  progressText: document.getElementById("progress-text"),
  progressFill: document.getElementById("progress-fill"),
  featureList: document.getElementById("feature-list"),
  summaryLine: document.getElementById("summary-line"),
  copyMarkdownBtn: document.getElementById("copy-markdown-btn"),
  downloadMarkdownBtn: document.getElementById("download-markdown-btn"),
  featureTemplate: document.getElementById("feature-card-template"),
  previewMeta: document.getElementById("preview-meta"),
  payloadPreview: document.getElementById("payload-preview"),
};

els.form.addEventListener("submit", onGenerateReport);
els.copyMarkdownBtn.addEventListener("click", onCopyMarkdown);
els.downloadMarkdownBtn.addEventListener("click", onDownloadMarkdown);

restoreSavedKeys();

function setRunningState(running) {
  appState.running = running;
  els.generateBtn.disabled = running;
  els.copyMarkdownBtn.disabled = running || !appState.currentReport;
  els.downloadMarkdownBtn.disabled = running || !appState.currentReport;
}

function setStatus(message, percent = null, level = "info") {
  els.statusText.textContent = message;
  els.statusText.classList.remove("status-error", "status-ok");
  if (level === "error") {
    els.statusText.classList.add("status-error");
  }
  if (level === "ok") {
    els.statusText.classList.add("status-ok");
  }

  if (typeof percent === "number") {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    els.progressText.textContent = `${clamped}%`;
    els.progressFill.style.width = `${clamped}%`;
  }
}

function clearResults() {
  els.featureList.innerHTML = "";
  els.summaryLine.textContent = "No report generated yet.";
  els.previewMeta.textContent = "Preview appears after commit extraction.";
  els.payloadPreview.textContent = "[]";
  appState.currentReport = null;
  appState.lastError = null;
}

function parseRepoInput(rawInput) {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error("Repo URL is required.");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid repository URL.");
    }

    if (url.hostname !== "github.com") {
      throw new Error("Only github.com URLs are supported.");
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      throw new Error("Repository URL must include owner and repo.");
    }

    return {
      owner: pathParts[0],
      repo: pathParts[1].replace(/\.git$/i, ""),
    };
  }

  const simpleParts = trimmed.split("/").filter(Boolean);
  if (simpleParts.length !== 2) {
    throw new Error("Use owner/repo or a full GitHub URL.");
  }

  return {
    owner: simpleParts[0],
    repo: simpleParts[1].replace(/\.git$/i, ""),
  };
}

function normalizeSinceDate(dateValue) {
  if (!dateValue) {
    return undefined;
  }

  const d = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return undefined;
  }
  return d.toISOString();
}

function normalizeUntilDate(dateValue) {
  if (!dateValue) {
    return undefined;
  }

  const d = new Date(`${dateValue}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) {
    return undefined;
  }
  return d.toISOString();
}

function restoreSavedKeys() {
  try {
    const githubToken = localStorage.getItem(STORAGE_KEYS.githubToken);
    const geminiKey = localStorage.getItem(STORAGE_KEYS.geminiKey);

    if (githubToken) {
      els.githubToken.value = githubToken;
    }
    if (geminiKey) {
      els.geminiKey.value = geminiKey;
    }
  } catch (error) {
    console.warn("Could not restore saved keys:", error);
  }
}

function saveKeysToStorage(githubToken, geminiKey) {
  try {
    localStorage.setItem(STORAGE_KEYS.githubToken, githubToken);
    localStorage.setItem(STORAGE_KEYS.geminiKey, geminiKey);
  } catch (error) {
    console.warn("Could not persist keys:", error);
  }
}

function truncateText(value, limit) {
  if (typeof value !== "string") {
    return "";
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

function isTransientError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "TypeError") {
    return true;
  }

  return /network|fetch|timeout/i.test(error.message);
}

function backoffDelay(baseMs, attempt) {
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 120);
  return exponential + jitter;
}

async function fetchWithRetry(url, options = {}, config = {}) {
  const retries = config.retries ?? RETRY_MAX_RETRIES;
  const baseDelayMs = config.baseDelayMs ?? RETRY_BASE_DELAY_MS;
  const shouldRetryStatus = config.shouldRetryStatus ?? isTransientStatus;

  let lastThrownError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return response;
      }

      if (attempt < retries && shouldRetryStatus(response.status)) {
        await sleep(backoffDelay(baseDelayMs, attempt));
        continue;
      }

      return response;
    } catch (error) {
      lastThrownError = error;
      if (attempt >= retries || !isTransientError(error)) {
        throw error;
      }

      await sleep(backoffDelay(baseDelayMs, attempt));
    }
  }

  if (lastThrownError) {
    throw lastThrownError;
  }

  throw new Error("Request failed after retry attempts.");
}

function safeJsonParse(value) {
  try {
    return { ok: true, data: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error };
  }
}

function buildGitHubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `token ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchCommitsPage({
  owner,
  repo,
  author,
  since,
  until,
  page,
  perPage,
  token,
}) {
  const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`);
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
    {
      headers: buildGitHubHeaders(token),
    },
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

async function fetchCommitDetails({ owner, repo, sha, token }) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${sha}`;
  const res = await fetchWithRetry(
    url,
    {
      headers: buildGitHubHeaders(token),
    },
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

async function toGitHubError(response) {
  let details = "";
  try {
    const body = await response.json();
    details = body?.message || "";
  } catch {
    details = "";
  }

  if (response.status === 401) {
    return new Error("GitHub authentication failed (401). Check your PAT.");
  }
  if (response.status === 404) {
    return new Error(
      "Repository not found (404) or no access with this token.",
    );
  }
  if (response.status === 403 || response.status === 429) {
    return new Error("GitHub rate limit reached. Wait a bit and try again.");
  }

  return new Error(
    `GitHub API error ${response.status}: ${details || "Unknown error"}`,
  );
}

async function collectCommits({ owner, repo, author, since, until, token }) {
  const commits = [];
  let page = 1;
  const perPage = 100;

  while (commits.length < MAX_COMMITS) {
    setStatus(`Fetching commits page ${page}...`, 8 + page * 2);
    const pageItems = await fetchCommitsPage({
      owner,
      repo,
      author,
      since,
      until,
      page,
      perPage,
      token,
    });
    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }

    commits.push(...pageItems);

    if (pageItems.length < perPage) {
      break;
    }

    page += 1;
  }

  const capped = commits.slice(0, MAX_COMMITS);
  const isCapped = commits.length > MAX_COMMITS;
  return { commits: capped, isCapped };
}

function compactCommit(detail) {
  const sha = (detail.sha || "").slice(0, 7);
  const message = truncateText(detail.commit?.message || "", MESSAGE_LIMIT);
  const date =
    detail.commit?.author?.date || detail.commit?.committer?.date || "";

  const files = Array.isArray(detail.files)
    ? detail.files
        .filter(
          (file) =>
            typeof file.patch === "string" && file.patch.trim().length > 0,
        )
        .slice(0, COMMIT_FILES_LIMIT)
        .map((file) => ({
          name: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: truncateText(file.patch, PATCH_LIMIT),
        }))
    : [];

  return {
    sha,
    date,
    message,
    files,
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function renderPayloadPreview(compactCommits) {
  const shown = compactCommits.slice(0, PREVIEW_COMMIT_LIMIT);
  const preview = {
    totalCommits: compactCommits.length,
    showing: shown.length,
    commits: shown,
  };

  els.previewMeta.textContent = `Showing ${shown.length}/${compactCommits.length} compact commits before Gemini analysis.`;
  els.payloadPreview.textContent = JSON.stringify(preview, null, 2);
}

function buildBatchPrompt(batchCommits) {
  return `You are analyzing Git commits from a software engineering internship.\nYour job is to identify distinct features or work items the developer built.\n\nCommits:\n${JSON.stringify(batchCommits, null, 2)}\n\nGroup related commits into features. Be technical and specific.\n\nReturn JSON only, in this exact structure:\n{\n  "features": [\n    {\n      "name": "Short feature name (3-6 words)",\n      "description": "2-3 sentences - what was built, how it works, why it matters",\n      "commits": ["abc1234", "def5678"],\n      "technologies": ["React", "PostgreSQL"],\n      "impact": "One sentence on business or technical impact"\n    }\n  ]\n}`;
}

function buildMergePrompt(allFeatures) {
  return `Below is a list of features extracted from multiple batches of Git commits.\nSome may be duplicates or closely related.\n\nMerge duplicates, combine related ones, and return a clean final list.\nKeep the most descriptive version of each. Do not invent new information.\n\nFeatures:\n${JSON.stringify({ features: allFeatures }, null, 2)}\n\nReturn JSON only:\n{ "features": [...] }`;
}

async function generateJsonFromGemini({ apiKey, prompt }) {
  const endpoint = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithRetry(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
    {
      shouldRetryStatus: isTransientStatus,
    },
  );

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(
      `Gemini API error ${res.status}: ${bodyText.slice(0, 240)}`,
    );
  }

  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = safeJsonParse(text);
  if (parsed.ok) {
    return parsed.data;
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const fallback = safeJsonParse(text.slice(firstBrace, lastBrace + 1));
    if (fallback.ok) {
      return fallback.data;
    }
  }

  throw new Error("Gemini returned malformed JSON.");
}

async function analyzeInBatches(commits, apiKey) {
  const chunks = chunkArray(commits, BATCH_SIZE);
  const collectedFeatures = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const batchNumber = i + 1;
    setStatus(
      `Analyzing batch ${batchNumber}/${chunks.length}...`,
      58 + (batchNumber / chunks.length) * 28,
    );

    try {
      const result = await generateJsonFromGemini({
        apiKey,
        prompt: buildBatchPrompt(chunks[i]),
      });

      if (Array.isArray(result?.features)) {
        collectedFeatures.push(...result.features);
      }
    } catch (error) {
      // Continue processing if one batch fails or has malformed JSON.
      console.warn(`Batch ${batchNumber} skipped:`, error);
    }
  }

  if (collectedFeatures.length === 0) {
    return [];
  }

  if (chunks.length <= 1) {
    return collectedFeatures;
  }

  setStatus("Merging duplicate features...", 92);
  try {
    const merged = await generateJsonFromGemini({
      apiKey,
      prompt: buildMergePrompt(collectedFeatures),
    });

    return Array.isArray(merged?.features)
      ? merged.features
      : collectedFeatures;
  } catch (error) {
    console.warn("Merge call failed, using raw collected features:", error);
    return collectedFeatures;
  }
}

function renderFeatureCards(features) {
  els.featureList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  features.forEach((feature) => {
    const node = els.featureTemplate.content.cloneNode(true);
    const title = node.querySelector(".feature-title");
    const count = node.querySelector(".feature-count");
    const description = node.querySelector(".feature-description");
    const impact = node.querySelector(".feature-impact");
    const techTags = node.querySelector(".tech-tags");

    title.textContent = feature.name || "Untitled feature";

    const commitCount = Array.isArray(feature.commits)
      ? feature.commits.length
      : 0;
    count.textContent = `${commitCount} commit${commitCount === 1 ? "" : "s"}`;

    description.textContent =
      feature.description || "No description returned by model.";
    impact.textContent = `Impact: ${feature.impact || "Not specified."}`;

    const technologies = Array.isArray(feature.technologies)
      ? feature.technologies
      : [];
    technologies.slice(0, 8).forEach((tech) => {
      const tag = document.createElement("span");
      tag.className = "tech-tag";
      tag.textContent = String(tech);
      techTags.append(tag);
    });

    fragment.append(node);
  });

  els.featureList.append(fragment);
}

function formatPeriod(commits) {
  const dates = commits
    .map((c) => new Date(c.date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (dates.length === 0) {
    return "N/A";
  }

  const format = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  });
  return `${format.format(dates[0])} -> ${format.format(dates[dates.length - 1])}`;
}

function buildMarkdownReport({ owner, repo, commits, features }) {
  const lines = [];
  lines.push(`# Internship Work Report - ${owner}/${repo}`);
  lines.push("");
  lines.push(`Period: ${formatPeriod(commits)} | Commits: ${commits.length}`);
  lines.push("");

  features.forEach((feature, index) => {
    lines.push(`## ${index + 1}. ${feature.name || "Untitled feature"}`);
    lines.push(feature.description || "No description provided.");
    lines.push(`**Impact:** ${feature.impact || "Not specified."}`);

    const technologies =
      Array.isArray(feature.technologies) && feature.technologies.length > 0
        ? feature.technologies.join(", ")
        : "Not specified";

    lines.push(`**Tech:** ${technologies}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

async function onGenerateReport(event) {
  event.preventDefault();
  if (appState.running) {
    return;
  }

  clearResults();
  els.inlineNote.textContent = "";

  const githubToken = els.githubToken.value.trim();
  const geminiKey = els.geminiKey.value.trim();
  const author = els.author.value.trim();
  const since = normalizeSinceDate(els.sinceDate.value);
  const until = normalizeUntilDate(els.untilDate.value);

  if (!githubToken || !geminiKey || !author || !els.repoUrl.value.trim()) {
    setStatus("Please fill all required fields.", 0, "error");
    return;
  }

  saveKeysToStorage(githubToken, geminiKey);

  let owner;
  let repo;
  try {
    ({ owner, repo } = parseRepoInput(els.repoUrl.value));
  } catch (error) {
    setStatus(error.message, 0, "error");
    return;
  }

  setRunningState(true);
  setStatus("Starting pipeline...", 3);

  try {
    const { commits: list, isCapped } = await collectCommits({
      owner,
      repo,
      author,
      since,
      until,
      token: githubToken,
    });

    if (list.length === 0) {
      setStatus("No commits found for this user/filter.", 100, "ok");
      els.summaryLine.textContent =
        "No matching commits found. Try widening the date range.";
      return;
    }

    if (isCapped) {
      els.inlineNote.textContent =
        "Showing only the latest 100 commits. Use Since Date to narrow scope.";
    }

    setStatus(`Fetching details for ${list.length} commits...`, 18);
    const compactCommits = [];

    for (let i = 0; i < list.length; i += 1) {
      const commit = list[i];
      const detail = await fetchCommitDetails({
        owner,
        repo,
        sha: commit.sha,
        token: githubToken,
      });
      compactCommits.push(compactCommit(detail));

      const pct = 18 + ((i + 1) / list.length) * 36;
      setStatus(`Fetching ${i + 1}/${list.length} commit details...`, pct);
      await sleep(COMMIT_FETCH_DELAY_MS);
    }

    renderPayloadPreview(compactCommits);

    const features = await analyzeInBatches(compactCommits, geminiKey);

    if (features.length === 0) {
      setStatus("No features extracted from analysis.", 100, "error");
      els.summaryLine.textContent =
        "Gemini did not return usable features. Try a narrower date range.";
      return;
    }

    renderFeatureCards(features);

    const markdown = buildMarkdownReport({
      owner,
      repo,
      commits: compactCommits,
      features,
    });

    appState.currentReport = {
      owner,
      repo,
      commitCount: compactCommits.length,
      features,
      markdown,
    };

    els.summaryLine.textContent = `Generated ${features.length} feature cards from ${compactCommits.length} commits.`;

    setStatus("Report complete.", 100, "ok");
  } catch (error) {
    appState.lastError = error;
    setStatus(
      error.message || "Something went wrong while generating the report.",
      100,
      "error",
    );
  } finally {
    setRunningState(false);
  }
}

async function onCopyMarkdown() {
  if (!appState.currentReport?.markdown) {
    return;
  }

  try {
    await navigator.clipboard.writeText(appState.currentReport.markdown);
    els.inlineNote.textContent = "Markdown copied to clipboard.";
    setStatus("Report complete and copied.", 100, "ok");
  } catch {
    els.inlineNote.textContent =
      "Clipboard permission denied. Copy manually from console output.";
    console.log(appState.currentReport.markdown);
  }
}

function slugifyFileSegment(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "report"
  );
}

function buildMarkdownFilename(report) {
  const datePart = new Date().toISOString().slice(0, 10);
  const owner = slugifyFileSegment(report.owner);
  const repo = slugifyFileSegment(report.repo);
  return `internship-report-${owner}-${repo}-${datePart}.md`;
}

function onDownloadMarkdown() {
  if (!appState.currentReport?.markdown) {
    return;
  }

  const markdownBlob = new Blob([appState.currentReport.markdown], {
    type: "text/markdown;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(markdownBlob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = buildMarkdownFilename(appState.currentReport);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  els.inlineNote.textContent = "Markdown file downloaded.";
}
