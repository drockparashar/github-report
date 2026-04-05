export const DEFAULTS = {
  maxCommits: 100,
  commitFilesLimit: 8,
  patchLimit: 500,
  messageLimit: 300,
  batchSize: 6,
  commitFetchDelayMs: 100,
  retryMaxRetries: 3,
  retryBaseDelayMs: 300,
  geminiModel: "gemini-2.5-flash",
};

export function parseRepoInput(rawInput) {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) {
    throw new Error("Repo is required.");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let url;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid repository URL.");
    }

    if (url.hostname !== "github.com") {
      throw new Error("Only github.com repositories are supported.");
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

export function normalizeSinceDate(dateValue) {
  if (!dateValue) {
    return undefined;
  }

  const d = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid since date: ${dateValue}`);
  }
  return d.toISOString();
}

export function normalizeUntilDate(dateValue) {
  if (!dateValue) {
    return undefined;
  }

  const d = new Date(`${dateValue}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid until date: ${dateValue}`);
  }
  return d.toISOString();
}

export function truncateText(value, limit) {
  if (typeof value !== "string") {
    return "";
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}...`;
}

export function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function safeJsonParse(value) {
  try {
    return { ok: true, data: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTransientStatus(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status);
}

export function isTransientError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "TypeError") {
    return true;
  }

  return /network|fetch|timeout/i.test(error.message);
}

export function backoffDelay(baseMs, attempt) {
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 120);
  return exponential + jitter;
}

export async function fetchWithRetry(url, options = {}, config = {}) {
  const retries = config.retries ?? DEFAULTS.retryMaxRetries;
  const baseDelayMs = config.baseDelayMs ?? DEFAULTS.retryBaseDelayMs;
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

export function slugifyFileSegment(value) {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "report"
  );
}
