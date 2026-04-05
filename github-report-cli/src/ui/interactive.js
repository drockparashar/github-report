import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function normalizeAnswer(answer) {
  return String(answer || "").trim();
}

export async function promptForMissing(config) {
  const rl = createInterface({ input, output });

  try {
    if (!config.githubToken) {
      config.githubToken = normalizeAnswer(await rl.question("GitHub token: "));
    }

    if (!config.geminiKey) {
      config.geminiKey = normalizeAnswer(await rl.question("Gemini API key: "));
    }

    if (!config.repo) {
      config.repo = normalizeAnswer(
        await rl.question("Repo (owner/repo or URL): "),
      );
    }

    if (!config.author) {
      config.author = normalizeAnswer(await rl.question("Author username: "));
    }

    if (!config.since) {
      const since = normalizeAnswer(
        await rl.question("Since date (YYYY-MM-DD, optional): "),
      );
      if (since) {
        config.since = `${since}T00:00:00.000Z`;
      }
    }

    if (!config.until) {
      const until = normalizeAnswer(
        await rl.question("Until date (YYYY-MM-DD, optional): "),
      );
      if (until) {
        config.until = `${until}T23:59:59.999Z`;
      }
    }
  } finally {
    rl.close();
  }

  return config;
}

export async function pickBranch(branches) {
  if (branches.length === 0) {
    throw new Error("No branches available to choose from.");
  }

  const rl = createInterface({ input, output });

  try {
    console.log("\nAvailable branches:");
    branches.forEach((branch, index) => {
      console.log(`  ${index + 1}. ${branch.name}`);
    });

    while (true) {
      const answer = normalizeAnswer(
        await rl.question("Choose branch by number or exact name: "),
      );

      if (!answer) {
        continue;
      }

      const asIndex = Number(answer);
      if (
        !Number.isNaN(asIndex) &&
        asIndex >= 1 &&
        asIndex <= branches.length
      ) {
        return branches[asIndex - 1].name;
      }

      const byName = branches.find((branch) => branch.name === answer);
      if (byName) {
        return byName.name;
      }

      console.log("Invalid selection. Try again.");
    }
  } finally {
    rl.close();
  }
}
