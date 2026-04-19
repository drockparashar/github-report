import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { DEFAULTS } from "../config/defaults.js";
import {
  collectCommitsForRepo,
  fetchCommitDetails,
  fetchRepositoryInfo,
} from "../clients/github.js";
import { analyzeInBatches } from "../clients/gemini.js";
import { compactCommit } from "./transform.js";
import {
  buildWeeklyMarkdownReport,
  buildWeeklyReportFilename,
} from "./report.js";
import { sleep } from "../utils/common.js";

export async function runWeeklyPipelineForRepo({
  repoConfig,
  startIso,
  endIso,
  githubToken,
  geminiKey,
  geminiModel,
  reportOutputDir,
  onProgress,
}) {
  const owner = repoConfig.owner;
  const repo = repoConfig.repo;

  if (!owner || !repo) {
    throw new Error("Repository config must include owner and repo.");
  }

  const repoInfo = await fetchRepositoryInfo({
    owner,
    repo,
    token: githubToken,
  });
  const selectedBranch = repoConfig.branch || repoInfo.default_branch;

  onProgress?.(
    `${owner}/${repo}: collecting commits on branch '${selectedBranch}'...`,
  );
  const { commits, isCapped } = await collectCommitsForRepo({
    owner,
    repo,
    branch: selectedBranch,
    since: startIso,
    until: endIso,
    token: githubToken,
    onProgress,
  });

  if (commits.length === 0) {
    return {
      owner,
      repo,
      branch: selectedBranch,
      commitCount: 0,
      compactCommits: [],
      features: [],
      isCapped,
      markdownPath: null,
    };
  }

  const compactCommits = [];
  for (let i = 0; i < commits.length; i += 1) {
    const detail = await fetchCommitDetails({
      owner,
      repo,
      sha: commits[i].sha,
      token: githubToken,
    });

    compactCommits.push(compactCommit(detail));
    onProgress?.(`${owner}/${repo}: commit details ${i + 1}/${commits.length}`);
    await sleep(DEFAULTS.commitFetchDelayMs);
  }

  const features = await analyzeInBatches({
    compactCommits,
    apiKey: geminiKey,
    model: geminiModel,
    onProgress,
  });

  const markdown = buildWeeklyMarkdownReport({
    owner,
    repo,
    branch: selectedBranch,
    commits: compactCommits,
    features,
    startIso,
    endIso,
  });

  const outputDir = resolve(reportOutputDir);
  await mkdir(outputDir, { recursive: true });
  const filename = buildWeeklyReportFilename({ owner, repo, startIso, endIso });
  const markdownPath = join(outputDir, filename);
  await writeFile(markdownPath, `${markdown}\n`, "utf8");

  return {
    owner,
    repo,
    branch: selectedBranch,
    commitCount: compactCommits.length,
    compactCommits,
    features,
    isCapped,
    markdownPath,
  };
}

export async function runWeeklyPipelineAcrossRepos({
  repos,
  startIso,
  endIso,
  githubToken,
  geminiKey,
  geminiModel,
  reportOutputDir,
  maxParallelRepos,
  onProgress,
}) {
  const queue = [...repos];
  const results = [];

  const workers = Array.from(
    { length: Math.max(1, Math.min(maxParallelRepos || 1, repos.length)) },
    async () => {
      while (queue.length > 0) {
        const repoConfig = queue.shift();
        if (!repoConfig) {
          return;
        }

        try {
          const result = await runWeeklyPipelineForRepo({
            repoConfig,
            startIso,
            endIso,
            githubToken,
            geminiKey,
            geminiModel,
            reportOutputDir,
            onProgress,
          });
          results.push({ status: "fulfilled", value: result });
        } catch (error) {
          results.push({
            status: "rejected",
            reason: {
              owner: repoConfig.owner,
              repo: repoConfig.repo,
              message: error.message,
            },
          });
        }
      }
    },
  );

  await Promise.all(workers);
  return results;
}
