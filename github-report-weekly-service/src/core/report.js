import { slugifyFileSegment } from "../utils/common.js";

function formatPeriod(commits, fallbackStart, fallbackEnd) {
  const dates = commits
    .map((c) => new Date(c.date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (dates.length === 0) {
    return `${fallbackStart} -> ${fallbackEnd}`;
  }

  const format = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  return `${format.format(dates[0])} -> ${format.format(dates[dates.length - 1])}`;
}

export function buildWeeklyMarkdownReport({
  owner,
  repo,
  branch,
  commits,
  features,
  startIso,
  endIso,
}) {
  const lines = [];
  lines.push(`# Weekly Engineering Update - ${owner}/${repo}`);
  lines.push("");
  lines.push(`Branch: ${branch || "default"}`);
  lines.push(`Window: ${startIso.slice(0, 10)} -> ${endIso.slice(0, 10)}`);
  lines.push(
    `Observed Period: ${formatPeriod(commits, startIso.slice(0, 10), endIso.slice(0, 10))}`,
  );
  lines.push(`Commits analyzed: ${commits.length}`);
  lines.push("");

  if (features.length === 0) {
    lines.push(
      "No major weekly workstreams were extracted for this repository.",
    );
    lines.push("");
    return lines.join("\n").trim();
  }

  features.forEach((feature, index) => {
    lines.push(`## ${index + 1}. ${feature.name || "Untitled workstream"}`);
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

export function buildWeeklyReportFilename({ owner, repo, startIso, endIso }) {
  const ownerSlug = slugifyFileSegment(owner);
  const repoSlug = slugifyFileSegment(repo);
  const start = startIso.slice(0, 10);
  const end = endIso.slice(0, 10);
  return `weekly-report-${ownerSlug}-${repoSlug}-${start}-to-${end}.md`;
}
