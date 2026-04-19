export const DEFAULTS = {
  maxReposPerRun: 20,
  maxCommitsPerRepo: 100,
  commitFilesLimit: 8,
  patchLimit: 500,
  messageLimit: 300,
  batchSize: 6,
  commitFetchDelayMs: 100,
  retryMaxRetries: 3,
  retryBaseDelayMs: 300,
  geminiModel: "gemini-2.5-flash",
  maxParallelRepos: 3,
  reportOutputDir: "artifacts",
};
