import { DEFAULTS, truncateText } from "../utils.js";

export function compactCommit(detail, options = {}) {
  const messageLimit = options.messageLimit ?? DEFAULTS.messageLimit;
  const commitFilesLimit =
    options.commitFilesLimit ?? DEFAULTS.commitFilesLimit;
  const patchLimit = options.patchLimit ?? DEFAULTS.patchLimit;

  const sha = (detail.sha || "").slice(0, 7);
  const message = truncateText(detail.commit?.message || "", messageLimit);
  const date =
    detail.commit?.author?.date || detail.commit?.committer?.date || "";

  const files = Array.isArray(detail.files)
    ? detail.files
        .filter(
          (file) =>
            typeof file.patch === "string" && file.patch.trim().length > 0,
        )
        .slice(0, commitFilesLimit)
        .map((file) => ({
          name: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: truncateText(file.patch, patchLimit),
        }))
    : [];

  return {
    sha,
    date,
    message,
    files,
  };
}
