import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildRuntimeConfig,
  parseArgs,
  printHelp,
  validateRequiredConfig,
} from "./config.js";
import { fetchRepoBranches } from "./clients/github.js";
import {
  buildMarkdownReport,
  buildDefaultMarkdownFilename,
  summarizeFeatures,
} from "./core/report.js";
import { runPipeline } from "./core/pipeline.js";
import { promptForMissing, pickBranch } from "./ui/interactive.js";
import { logStage, logSubstage, logSummary } from "./ui/progress.js";
import { parseRepoInput } from "./utils.js";

const PREVIEW_LIMIT = 5;

function printFeatureSummary(features) {
  if (features.length === 0) {
    console.log("\nNo weekly workstreams were extracted by Gemini.");
    return;
  }

  console.log("\nWeekly workstream summary:");
  const summary = summarizeFeatures(features);
  summary.forEach((item) => {
    console.log(`  ${item.index}. ${item.name}`);
    console.log(`     commits: ${item.commits}`);
    if (item.tech) {
      console.log(`     tech: ${item.tech}`);
    }
    console.log(`     impact: ${item.impact}`);
  });
}

export async function runCli(argv) {
  const parsedArgs = parseArgs(argv);
  const config = buildRuntimeConfig(parsedArgs);

  if (config.help || config.command === "help") {
    printHelp();
    return;
  }

  if (config.command !== "generate") {
    throw new Error(`Unknown command: ${config.command}`);
  }

  if (!config.nonInteractive) {
    await promptForMissing(config);
  }

  const missing = validateRequiredConfig(config);
  if (missing.length > 0) {
    throw new Error(`Missing required inputs: ${missing.join(", ")}`);
  }

  const { owner, repo } = parseRepoInput(config.repo);

  logStage(`Loading branches for ${owner}/${repo}...`);
  const branches = await fetchRepoBranches({
    owner,
    repo,
    token: config.githubToken,
  });
  if (branches.length === 0) {
    throw new Error("No branches found in this repository.");
  }

  let selectedBranch = config.branch;
  if (!selectedBranch) {
    if (config.nonInteractive) {
      throw new Error(
        "Branch is required in non-interactive mode. Pass --branch.",
      );
    }
    selectedBranch = await pickBranch(branches);
  } else {
    const exists = branches.some((branch) => branch.name === selectedBranch);
    if (!exists) {
      throw new Error(
        `Branch '${selectedBranch}' was not found in ${owner}/${repo}.`,
      );
    }
  }

  logStage(`Running pipeline on branch '${selectedBranch}'...`);
  const result = await runPipeline({
    owner,
    repo,
    branch: selectedBranch,
    author: config.author,
    since: config.since,
    until: config.until,
    githubToken: config.githubToken,
    geminiKey: config.geminiKey,
    model: config.model,
    onProgress: logSubstage,
  });

  if (result.isCapped) {
    logSubstage(
      "Commit list was capped at 100. Use --since/--until to narrow scope.",
    );
  }

  if (result.compactCommits.length === 0) {
    logStage("No matching commits found for this branch and filter.");
    return;
  }

  if (config.showPreview) {
    const preview = {
      totalCommits: result.compactCommits.length,
      showing: Math.min(PREVIEW_LIMIT, result.compactCommits.length),
      commits: result.compactCommits.slice(0, PREVIEW_LIMIT),
    };
    console.log("\nCompact payload preview:");
    console.log(JSON.stringify(preview, null, 2));
  }

  const markdown = buildMarkdownReport({
    owner,
    repo,
    branch: selectedBranch,
    commits: result.compactCommits,
    features: result.features,
  });

  const markdownPath = resolve(
    config.markdownOut ||
      buildDefaultMarkdownFilename({ owner, repo, branch: selectedBranch }),
  );
  await writeFile(markdownPath, `${markdown}\n`, "utf8");

  let jsonPath;
  if (config.jsonOut) {
    jsonPath = resolve(config.jsonOut);
    await writeFile(
      jsonPath,
      `${JSON.stringify(
        {
          owner,
          repo,
          branch: selectedBranch,
          commits: result.compactCommits,
          features: result.features,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  logStage("Generation complete.");
  logSummary("Repository", `${owner}/${repo}`);
  logSummary("Branch", selectedBranch);
  logSummary("Commits analyzed", String(result.compactCommits.length));
  logSummary("Workstreams extracted", String(result.features.length));
  logSummary("Markdown", markdownPath);
  if (jsonPath) {
    logSummary("JSON", jsonPath);
  }

  printFeatureSummary(result.features);
}
