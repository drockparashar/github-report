import {
  DEFAULTS,
  chunkArray,
  fetchWithRetry,
  isTransientStatus,
  safeJsonParse,
} from "../utils.js";
import { buildBatchPrompt, buildMergePrompt } from "../core/prompts.js";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export async function generateJsonFromGemini({
  apiKey,
  prompt,
  model = DEFAULTS.geminiModel,
}) {
  const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

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
      `Gemini API error ${res.status}: ${bodyText.slice(0, 280)}`,
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

export async function analyzeInBatches({
  compactCommits,
  apiKey,
  model = DEFAULTS.geminiModel,
  batchSize = DEFAULTS.batchSize,
  onProgress,
}) {
  const chunks = chunkArray(compactCommits, batchSize);
  const collectedFeatures = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const batchNumber = i + 1;
    onProgress?.(`Analyzing batch ${batchNumber}/${chunks.length}...`);

    try {
      const result = await generateJsonFromGemini({
        apiKey,
        model,
        prompt: buildBatchPrompt(chunks[i]),
      });

      if (Array.isArray(result?.features)) {
        collectedFeatures.push(...result.features);
      }
    } catch (error) {
      console.warn(`Batch ${batchNumber} skipped: ${error.message}`);
    }
  }

  if (collectedFeatures.length === 0) {
    return [];
  }

  if (chunks.length <= 1) {
    return collectedFeatures;
  }

  onProgress?.("Merging and deduplicating features...");
  try {
    const merged = await generateJsonFromGemini({
      apiKey,
      model,
      prompt: buildMergePrompt(collectedFeatures),
    });

    return Array.isArray(merged?.features)
      ? merged.features
      : collectedFeatures;
  } catch (error) {
    console.warn(`Merge failed, using collected features: ${error.message}`);
    return collectedFeatures;
  }
}
