import { slugifyFileSegment } from "../utils.js";

function formatPeriod(commits) {
  const dates = commits
    .map((c) => new Date(c.date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (dates.length === 0) {
    return "N/A";
  }

  const format = new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  });

  return `${format.format(dates[0])} -> ${format.format(dates[dates.length - 1])}`;
}

export function buildMarkdownReport({
  owner,
  repo,
  branch,
  commits,
  features,
}) {
  const lines = [];
  lines.push(`# Internship Work Report - ${owner}/${repo}`);
  lines.push("");
  lines.push(`Branch: ${branch || "N/A"}`);
  lines.push("");
  lines.push(`Period: ${formatPeriod(commits)} | Commits: ${commits.length}`);
  lines.push("");

  features.forEach((feature, index) => {
    lines.push(`## ${index + 1}. ${feature.name || "Untitled feature"}`);
    lines.push(feature.description || "No description provided.");
    lines.push(`**Impact:** ${feature.impact || "Not specified."}`);

    const technologies =
      Array.isArray(feature.technologies) && feature.technologies.length > 0
        ? feature.technologies.join(", ")
        : "Not specified";

    lines.push(`**Tech:** ${technologies}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

export function buildDefaultMarkdownFilename({ owner, repo, branch }) {
  const datePart = new Date().toISOString().slice(0, 10);
  const ownerSlug = slugifyFileSegment(owner);
  const repoSlug = slugifyFileSegment(repo);
  const branchSlug = slugifyFileSegment(branch || "branch");
  return `internship-report-${ownerSlug}-${repoSlug}-${branchSlug}-${datePart}.md`;
}

export function summarizeFeatures(features) {
  return features.map((feature, index) => {
    const commitCount = Array.isArray(feature.commits)
      ? feature.commits.length
      : 0;
    const tech = Array.isArray(feature.technologies)
      ? feature.technologies.slice(0, 5).join(", ")
      : "";

    return {
      index: index + 1,
      name: feature.name || "Untitled feature",
      commits: commitCount,
      impact: feature.impact || "Not specified",
      tech,
    };
  });
}
