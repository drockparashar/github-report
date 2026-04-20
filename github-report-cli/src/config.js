import { normalizeSinceDate, normalizeUntilDate } from "./utils.js";

export function parseArgs(argv) {
  const args = {
    command: "generate",
    options: {},
    flags: new Set(),
  };

  const tokens = [...argv];
  if (tokens[0] && !tokens[0].startsWith("-")) {
    args.command = tokens.shift();
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token === "--help" || token === "-h") {
      args.flags.add("help");
      continue;
    }

    if (token.startsWith("--")) {
      const [key, inlineValue] = token.slice(2).split("=", 2);
      if (inlineValue !== undefined) {
        args.options[key] = inlineValue;
        continue;
      }

      const next = tokens[i + 1];
      if (!next || next.startsWith("-")) {
        args.flags.add(key);
      } else {
        args.options[key] = next;
        i += 1;
      }
    }
  }

  return args;
}

export function buildRuntimeConfig(parsedArgs, env = process.env) {
  const nonInteractive = parsedArgs.flags.has("non-interactive");

  const config = {
    command: parsedArgs.command || "generate",
    help: parsedArgs.flags.has("help"),
    nonInteractive,
    githubToken: parsedArgs.options["github-token"] || env.GITHUB_TOKEN,
    geminiKey: parsedArgs.options["gemini-key"] || env.GEMINI_API_KEY,
    repo: parsedArgs.options.repo,
    author: parsedArgs.options.author,
    branch: parsedArgs.options.branch,
    since: parsedArgs.options.since,
    until: parsedArgs.options.until,
    markdownOut: parsedArgs.options.output,
    jsonOut: parsedArgs.options["json-output"],
    model: parsedArgs.options.model,
    showPreview: !parsedArgs.flags.has("no-preview"),
  };

  if (config.since) {
    config.since = normalizeSinceDate(config.since);
  }
  if (config.until) {
    config.until = normalizeUntilDate(config.until);
  }

  return config;
}

export function validateRequiredConfig(config) {
  const missing = [];

  if (!config.githubToken) missing.push("github-token (or GITHUB_TOKEN)");
  if (!config.geminiKey) missing.push("gemini-key (or GEMINI_API_KEY)");
  if (!config.repo) missing.push("repo");
  if (!config.author) missing.push("author");

  return missing;
}

export function printHelp() {
  const text = `\nGitHub Weekly Update CLI\n\nUsage:\n  node ./bin/report.js generate [options]\n\nOptions:\n  --github-token <token>     GitHub personal access token\n  --gemini-key <key>         Gemini API key\n  --repo <owner/repo|url>    GitHub repository\n  --author <username>        Contributor username filter\n  --branch <branch>          Branch to analyze (optional, interactive pick if omitted)\n  --since <YYYY-MM-DD>       Since date filter\n  --until <YYYY-MM-DD>       Until date filter\n  --output <file.md>         Markdown output path\n  --json-output <file.json>  Optional JSON output path\n  --model <modelName>        Gemini model override\n  --non-interactive          Fail instead of prompting for missing inputs\n  --no-preview               Do not print compact payload preview summary\n  --help                     Show this help\n\nExamples:\n  node ./bin/report.js generate --repo owner/repo --author user\n  node ./bin/report.js generate --repo owner/repo --author user --branch main --output weekly-update.md\n`;

  console.log(text);
}
