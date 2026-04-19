import { DEFAULTS } from "../config/defaults.js";
import { truncateText } from "../utils/common.js";

export function compactCommit(detail) {
  const sha = (detail.sha || "").slice(0, 7);
  const message = truncateText(
    detail.commit?.message || "",
    DEFAULTS.messageLimit,
  );
  const date =
    detail.commit?.author?.date || detail.commit?.committer?.date || "";

  const files = Array.isArray(detail.files)
    ? detail.files
        .filter(
          (file) =>
            typeof file.patch === "string" && file.patch.trim().length > 0,
        )
        .slice(0, DEFAULTS.commitFilesLimit)
        .map((file) => ({
          name: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: truncateText(file.patch, DEFAULTS.patchLimit),
        }))
    : [];

  return {
    sha,
    date,
    message,
    files,
  };
}
