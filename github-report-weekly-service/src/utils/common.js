import { randomUUID } from "node:crypto";

export function newJobId() {
  return randomUUID();
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
  const retries = config.retries ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 300;
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
      .slice(0, 60) || "report"
  );
}
