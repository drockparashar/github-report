import { collectCommits, fetchCommitDetails } from "../clients/github.js";
import { analyzeInBatches } from "../clients/gemini.js";
import { compactCommit } from "./transform.js";
import { DEFAULTS, sleep } from "../utils.js";

export async function runPipeline({
  owner,
  repo,
  branch,
  author,
  since,
  until,
  githubToken,
  geminiKey,
  model,
  onProgress,
}) {
  const { commits: list, isCapped } = await collectCommits({
    owner,
    repo,
    branch,
    author,
    since,
    until,
    token: githubToken,
    maxCommits: DEFAULTS.maxCommits,
    onProgress,
  });

  if (list.length === 0) {
    return {
      isCapped,
      compactCommits: [],
      features: [],
    };
  }

  onProgress?.(`Fetching details for ${list.length} commits...`);
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
    onProgress?.(`Fetched ${i + 1}/${list.length} commit details...`);
    await sleep(DEFAULTS.commitFetchDelayMs);
  }

  const features = await analyzeInBatches({
    compactCommits,
    apiKey: geminiKey,
    model,
    batchSize: DEFAULTS.batchSize,
    onProgress,
  });

  return {
    isCapped,
    compactCommits,
    features,
  };
}
