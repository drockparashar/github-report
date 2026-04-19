import { buildRuntimeConfig } from "../config/runtime.js";
import { newJobId } from "../utils/common.js";
import { saveJob } from "../core/job-store.js";
import { runWeeklyPipelineAcrossRepos } from "../core/weekly-pipeline.js";

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(event = {}) {
  const jobId = newJobId();

  try {
    const cfg = buildRuntimeConfig({ event });

    const startedAt = new Date().toISOString();
    const baseJob = {
      jobId,
      status: "running",
      startedAt,
      startIso: cfg.startIso,
      endIso: cfg.endIso,
      repos: cfg.repos,
      results: [],
      completedAt: null,
    };
    await saveJob(baseJob);

    const results = await runWeeklyPipelineAcrossRepos({
      repos: cfg.repos,
      startIso: cfg.startIso,
      endIso: cfg.endIso,
      githubToken: cfg.githubToken,
      geminiKey: cfg.geminiKey,
      geminiModel: cfg.geminiModel,
      reportOutputDir: cfg.reportOutputDir,
      maxParallelRepos: cfg.maxParallelRepos,
      onProgress: (message) => console.log(`[${jobId}] ${message}`),
    });

    const hasFailure = results.some((r) => r.status === "rejected");
    const finalJob = {
      ...baseJob,
      status: hasFailure ? "partial-failed" : "completed",
      completedAt: new Date().toISOString(),
      results,
    };
    await saveJob(finalJob);

    return response(200, {
      jobId,
      status: finalJob.status,
      startIso: cfg.startIso,
      endIso: cfg.endIso,
      repositories: cfg.repos.length,
      successful: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    });
  } catch (error) {
    await saveJob({
      jobId,
      status: "failed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      error: error.message,
      results: [],
    });

    return response(400, {
      jobId,
      status: "failed",
      error: error.message,
    });
  }
}

if (process.argv[1] && process.argv[1].endsWith("api-generate.js")) {
  const today = new Date().toISOString().slice(0, 10);
  handler({
    body: JSON.stringify({
      startDate: today,
      endDate: today,
    }),
  }).then((res) => console.log(res.body));
}
