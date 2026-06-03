const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_AI_PROVIDER = "gemini";
const AI_PROVIDERS = {
  gemini: {
    label: "Gemini",
    defaultModel: "gemini-2.5-flash",
    keyPlaceholder: "AIza...",
    keyHelp: "Use a Gemini API key from Google AI Studio.",
    modelHelp: "Google Generative Language model for JSON analysis.",
  },
  anthropic: {
    label: "Anthropic",
    defaultModel: "claude-3-5-sonnet-latest",
    keyPlaceholder: "sk-ant-...",
    keyHelp: "Use an Anthropic API key for the Messages API.",
    modelHelp: "Anthropic Messages API model for JSON analysis.",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-...",
    keyHelp: "Use an OpenAI API key for chat completions.",
    modelHelp: "OpenAI chat model for JSON analysis.",
  },
};
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MAX_COMMITS = 100;
const COMMIT_FILES_LIMIT = 8;
const PATCH_LIMIT = 500;
const MESSAGE_LIMIT = 300;
const BATCH_SIZE = 6;
const COMMIT_FETCH_DELAY_MS = 100;
const PREVIEW_COMMIT_LIMIT = 12;
const RETRY_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;
const MAX_BRANCHES = 200;
const STORAGE_KEYS = {
  githubToken: "report.githubToken",
  aiProvider: "report.aiProvider",
  aiKey: "report.aiKey",
  aiModel: "report.aiModel",
  legacyGeminiKey: "report.geminiKey",
};

const appState = {
  running: false,
  currentReport: null,
  lastError: null,
  repoContext: null,
  branches: [],
  selectedBranch: "",
};

const els = {
  form: document.getElementById("report-form"),
  githubToken: document.getElementById("github-token"),
  aiProvider: document.getElementById("ai-provider"),
  aiKey: document.getElementById("ai-key"),
  aiModel: document.getElementById("ai-model"),
  aiProviderHelp: document.getElementById("ai-provider-help"),
  aiKeyHelp: document.getElementById("ai-key-help"),
  aiModelHelp: document.getElementById("ai-model-help"),
  repoUrl: document.getElementById("repo-url"),
  author: document.getElementById("author-username"),
  sinceDate: document.getElementById("since-date"),
  untilDate: document.getElementById("until-date"),
  branchStep: document.getElementById("branch-step"),
  branchSelect: document.getElementById("branch-select"),
  inlineNote: document.getElementById("inline-note"),
  loadBranchesBtn: document.getElementById("load-branches-btn"),
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
els.loadBranchesBtn.addEventListener("click", onLoadBranches);
els.branchSelect.addEventListener("change", onBranchSelectionChange);
els.copyMarkdownBtn.addEventListener("click", onCopyMarkdown);
els.downloadMarkdownBtn.addEventListener("click", onDownloadMarkdown);
els.aiProvider.addEventListener("change", onAiProviderChange);

[els.repoUrl, els.githubToken].forEach((inputEl) => {
  inputEl.addEventListener("input", () => clearBranchSelectionState(false));
});

restoreSavedKeys();
updateAiProviderUi();

function getProviderConfig(provider) {
  return AI_PROVIDERS[provider] || AI_PROVIDERS[DEFAULT_AI_PROVIDER];
}

function getProviderLabel(provider) {
  return getProviderConfig(provider).label;
}

function updateAiProviderUi({ resetModel = false } = {}) {
  const provider = AI_PROVIDERS[els.aiProvider.value]
    ? els.aiProvider.value
    : DEFAULT_AI_PROVIDER;
  const config = getProviderConfig(provider);

  if (els.aiProvider.value !== provider) {
    els.aiProvider.value = provider;
  }

  els.aiKey.placeholder = config.keyPlaceholder;
  els.aiKeyHelp.textContent = config.keyHelp;
  els.aiModelHelp.textContent = config.modelHelp;
  els.aiProviderHelp.textContent = `${config.label} will analyze commit batches and shape them into a stakeholder-ready brief.`;

  if (resetModel || !els.aiModel.value.trim()) {
    els.aiModel.value = config.defaultModel;
  }
}

function onAiProviderChange() {
  updateAiProviderUi({ resetModel: true });
}

function setRunningState(running) {
  appState.running = running;
  els.loadBranchesBtn.disabled = running;
  els.branchSelect.disabled = running || appState.branches.length === 0;
  els.generateBtn.disabled = running;
  els.copyMarkdownBtn.disabled = running || !appState.currentReport;
  els.downloadMarkdownBtn.disabled = running || !appState.currentReport;
  updateGenerateButtonState();
}

function updateGenerateButtonState() {
  els.generateBtn.disabled =
    appState.running ||
    !appState.selectedBranch ||
    appState.branches.length === 0;
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
  els.summaryLine.textContent = "No commit intelligence brief generated yet.";
  els.previewMeta.textContent = "Preview appears after commit extraction.";
  els.payloadPreview.textContent = "[]";
  appState.currentReport = null;
  appState.lastError = null;
  setRunningState(false);
}

function clearBranchSelectionState(clearMessage = true) {
  appState.repoContext = null;
  appState.branches = [];
  appState.selectedBranch = "";
  els.branchSelect.innerHTML = "";
  els.branchStep.hidden = true;
  updateGenerateButtonState();

  if (clearMessage) {
    els.inlineNote.textContent = "";
  }
}

function populateBranchOptions(branches) {
  els.branchSelect.innerHTML = "";

  branches.forEach((branch) => {
    const option = document.createElement("option");
    option.value = branch.name;
    option.textContent = branch.name;
    els.branchSelect.append(option);
  });

  appState.branches = branches;
  appState.selectedBranch = branches[0]?.name || "";
  els.branchSelect.value = appState.selectedBranch;
  els.branchStep.hidden = branches.length === 0;
  updateGenerateButtonState();
}

function onBranchSelectionChange() {
  appState.selectedBranch = els.branchSelect.value;
  updateGenerateButtonState();
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
    const aiProvider = localStorage.getItem(STORAGE_KEYS.aiProvider);
    const aiKey =
      localStorage.getItem(STORAGE_KEYS.aiKey) ||
      localStorage.getItem(STORAGE_KEYS.legacyGeminiKey);
    const aiModel = localStorage.getItem(STORAGE_KEYS.aiModel);

    if (githubToken) {
      els.githubToken.value = githubToken;
    }
    if (aiProvider && AI_PROVIDERS[aiProvider]) {
      els.aiProvider.value = aiProvider;
    }
    if (aiKey) {
      els.aiKey.value = aiKey;
    }
    if (aiModel) {
      els.aiModel.value = aiModel;
    }
  } catch (error) {
    console.warn("Could not restore saved keys:", error);
  }
}

function saveKeysToStorage({ githubToken, aiProvider, aiKey, aiModel }) {
  try {
    localStorage.setItem(STORAGE_KEYS.githubToken, githubToken);
    localStorage.setItem(STORAGE_KEYS.aiProvider, aiProvider);
    localStorage.setItem(STORAGE_KEYS.aiKey, aiKey);
    localStorage.setItem(STORAGE_KEYS.aiModel, aiModel);
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
  branch,
  author,
  since,
  until,
  page,
  perPage,
  token,
}) {
  const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`);
  if (branch) {
    url.searchParams.set("sha", branch);
  }
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

async function fetchBranchesPage({ owner, repo, page, perPage, token }) {
  const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches`);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));

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

async function fetchRepoBranches({ owner, repo, token }) {
  const branches = [];
  let page = 1;
  const perPage = 100;

  while (branches.length < MAX_BRANCHES) {
    const pageItems = await fetchBranchesPage({
      owner,
      repo,
      page,
      perPage,
      token,
    });

    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }

    branches.push(...pageItems);

    if (pageItems.length < perPage) {
      break;
    }

    page += 1;
  }

  return branches.slice(0, MAX_BRANCHES);
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

async function collectCommits({
  owner,
  repo,
  branch,
  author,
  since,
  until,
  token,
}) {
  const commits = [];
  let page = 1;
  const perPage = 100;

  while (commits.length < MAX_COMMITS) {
    setStatus(`Fetching commits page ${page}...`, 8 + page * 2);
    const pageItems = await fetchCommitsPage({
      owner,
      repo,
      branch,
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

  els.previewMeta.textContent = `Showing ${shown.length}/${compactCommits.length} compact commits before AI analysis.`;
  els.payloadPreview.textContent = JSON.stringify(preview, null, 2);
}

function buildBatchPrompt(batchCommits) {
  return `You are analyzing Git commits for a commit intelligence report.\nYour job is to identify distinct delivery themes, technical changes, operational improvements, or product updates represented by the commits.\n\nCommits:\n${JSON.stringify(batchCommits, null, 2)}\n\nGroup related commits into report sections. Be technical, specific, and useful to product, client, leadership, or audit readers.\n\nReturn JSON only, in this exact structure:\n{\n  "features": [\n    {\n      "name": "Short report section name (3-6 words)",\n      "description": "2-3 sentences - what changed, how it works, and why it matters",\n      "commits": ["abc1234", "def5678"],\n      "technologies": ["React", "PostgreSQL"],\n      "impact": "One sentence on business, user, delivery, risk, or technical impact"\n    }\n  ]\n}`;
}

function buildMergePrompt(allFeatures) {
  return `Below is a list of report sections extracted from multiple batches of Git commits.\nSome may be duplicates or closely related.\n\nMerge duplicates, combine related sections, and return a clean final commit intelligence brief.\nKeep the most descriptive version of each. Do not invent new information.\n\nFeatures:\n${JSON.stringify({ features: allFeatures }, null, 2)}\n\nReturn JSON only:\n{ "features": [...] }`;
}

function buildAiRequest({ provider, apiKey, model, prompt }) {
  if (provider === "anthropic") {
    return {
      endpoint: ANTHROPIC_API_URL,
      options: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      },
    };
  }

  if (provider === "openai") {
    return {
      endpoint: OPENAI_API_URL,
      options: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      },
    };
  }

  return {
    endpoint: `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    options: {
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
  };
}

function extractAiText(provider, payload) {
  if (provider === "anthropic") {
    const content = payload?.content || [];
    return content
      .map((part) => (part?.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }

  if (provider === "openai") {
    return payload?.choices?.[0]?.message?.content;
  }

  return payload?.candidates?.[0]?.content?.parts?.[0]?.text;
}

async function generateJsonFromAi({ provider, apiKey, model, prompt }) {
  const providerLabel = getProviderLabel(provider);
  const { endpoint, options } = buildAiRequest({
    provider,
    apiKey,
    model,
    prompt,
  });
  const res = await fetchWithRetry(endpoint, options, {
    shouldRetryStatus: isTransientStatus,
  });

  if (!res.ok) {
    const bodyText = await res.text();
    throw new Error(
      `${providerLabel} API error ${res.status}: ${bodyText.slice(0, 240)}`,
    );
  }

  const payload = await res.json();
  const text = extractAiText(provider, payload);

  if (!text) {
    throw new Error(`${providerLabel} returned an empty response.`);
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

  throw new Error(`${providerLabel} returned malformed JSON.`);
}

async function analyzeInBatches({ commits, provider, apiKey, model }) {
  const chunks = chunkArray(commits, BATCH_SIZE);
  const collectedFeatures = [];
  const providerLabel = getProviderLabel(provider);

  for (let i = 0; i < chunks.length; i += 1) {
    const batchNumber = i + 1;
    setStatus(
      `Analyzing batch ${batchNumber}/${chunks.length} with ${providerLabel}...`,
      58 + (batchNumber / chunks.length) * 28,
    );

    try {
      const result = await generateJsonFromAi({
        provider,
        apiKey,
        model,
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

  setStatus(`Merging related report sections with ${providerLabel}...`, 92);
  try {
    const merged = await generateJsonFromAi({
      provider,
      apiKey,
      model,
      prompt: buildMergePrompt(collectedFeatures),
    });

    return Array.isArray(merged?.features)
      ? merged.features
      : collectedFeatures;
  } catch (error) {
    console.warn("Merge call failed, using raw collected report sections:", error);
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

    title.textContent = feature.name || "Untitled report section";

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

function buildMarkdownReport({ owner, repo, branch, commits, features }) {
  const lines = [];
  lines.push(`# Commit Brief - ${owner}/${repo}`);
  lines.push("");
  lines.push(`Branch: ${branch || "N/A"}`);
  lines.push("");
  lines.push(`Period: ${formatPeriod(commits)} | Commits: ${commits.length}`);
  lines.push("");

  features.forEach((feature, index) => {
    lines.push(`## ${index + 1}. ${feature.name || "Untitled report section"}`);
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

function readBaseInputs() {
  const githubToken = els.githubToken.value.trim();
  const aiProvider = AI_PROVIDERS[els.aiProvider.value]
    ? els.aiProvider.value
    : DEFAULT_AI_PROVIDER;
  const aiKey = els.aiKey.value.trim();
  const aiModel =
    els.aiModel.value.trim() || getProviderConfig(aiProvider).defaultModel;
  const author = els.author.value.trim();
  const since = normalizeSinceDate(els.sinceDate.value);
  const until = normalizeUntilDate(els.untilDate.value);
  const repoInput = els.repoUrl.value.trim();

  return {
    githubToken,
    aiProvider,
    aiKey,
    aiModel,
    author,
    since,
    until,
    repoInput,
  };
}

async function onLoadBranches() {
  if (appState.running) {
    return;
  }

  const { githubToken, aiProvider, aiKey, aiModel, author, repoInput } =
    readBaseInputs();

  if (!githubToken || !aiKey || !aiModel || !author || !repoInput) {
    setStatus("Fill all required fields before loading branches.", 0, "error");
    return;
  }

  let owner;
  let repo;
  try {
    ({ owner, repo } = parseRepoInput(repoInput));
  } catch (error) {
    setStatus(error.message, 0, "error");
    return;
  }

  clearBranchSelectionState(false);
  saveKeysToStorage({ githubToken, aiProvider, aiKey, aiModel });
  setRunningState(true);
  setStatus("Loading repository branches...", 6);

  try {
    const branches = await fetchRepoBranches({
      owner,
      repo,
      token: githubToken,
    });

    if (branches.length === 0) {
      clearBranchSelectionState(false);
      setStatus("No branches found in this repository.", 100, "error");
      return;
    }

    populateBranchOptions(branches);
    appState.repoContext = { owner, repo };
    els.inlineNote.textContent = `Loaded ${branches.length} branches. Select one and generate.`;
    setStatus(
      "Branches loaded. Choose a branch and generate report.",
      15,
      "ok",
    );
  } catch (error) {
    clearBranchSelectionState(false);
    setStatus(
      error.message || "Could not load branches for this repository.",
      100,
      "error",
    );
  } finally {
    setRunningState(false);
  }
}

async function onGenerateReport(event) {
  event.preventDefault();
  if (appState.running) {
    return;
  }

  clearResults();
  els.inlineNote.textContent = "";

  const {
    githubToken,
    aiProvider,
    aiKey,
    aiModel,
    author,
    since,
    until,
    repoInput,
  } = readBaseInputs();

  if (!githubToken || !aiKey || !aiModel || !author || !repoInput) {
    setStatus("Please fill all required fields.", 0, "error");
    return;
  }

  if (!appState.selectedBranch) {
    setStatus("Load branches and select one before generating.", 0, "error");
    return;
  }

  saveKeysToStorage({ githubToken, aiProvider, aiKey, aiModel });

  let owner;
  let repo;
  try {
    ({ owner, repo } = parseRepoInput(repoInput));
  } catch (error) {
    setStatus(error.message, 0, "error");
    return;
  }

  if (
    !appState.repoContext ||
    appState.repoContext.owner !== owner ||
    appState.repoContext.repo !== repo
  ) {
    setStatus("Repository changed. Click Load Branches again.", 0, "error");
    updateGenerateButtonState();
    return;
  }

  setRunningState(true);
  setStatus(`Starting pipeline on branch ${appState.selectedBranch}...`, 3);

  try {
    const { commits: list, isCapped } = await collectCommits({
      owner,
      repo,
      branch: appState.selectedBranch,
      author,
      since,
      until,
      token: githubToken,
    });

    if (list.length === 0) {
      setStatus("No commits found for this user/filter.", 100, "ok");
      els.summaryLine.textContent =
        "No matching commits found. Try widening the reporting window.";
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

    const features = await analyzeInBatches({
      commits: compactCommits,
      provider: aiProvider,
      apiKey: aiKey,
      model: aiModel,
    });

    if (features.length === 0) {
      setStatus("No report sections extracted from analysis.", 100, "error");
      els.summaryLine.textContent =
        `${getProviderLabel(aiProvider)} did not return usable report sections. Try a narrower reporting window.`;
      return;
    }

    renderFeatureCards(features);

    const markdown = buildMarkdownReport({
      owner,
      repo,
      branch: appState.selectedBranch,
      commits: compactCommits,
      features,
    });

    appState.currentReport = {
      owner,
      repo,
      branch: appState.selectedBranch,
      commitCount: compactCommits.length,
      features,
      markdown,
    };

    els.summaryLine.textContent = `Generated ${features.length} report sections from ${compactCommits.length} commits on branch ${appState.selectedBranch}.`;

    setStatus("Commit brief complete.", 100, "ok");
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
    setStatus("Commit brief copied.", 100, "ok");
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
  return `commit-brief-${owner}-${repo}-${datePart}.md`;
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
