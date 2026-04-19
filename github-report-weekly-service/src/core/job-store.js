import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const JOB_DIR = resolve(".local-jobs");

async function ensureJobDir() {
  await mkdir(JOB_DIR, { recursive: true });
}

function jobFilePath(jobId) {
  return join(JOB_DIR, `${jobId}.json`);
}

export async function saveJob(job) {
  await ensureJobDir();
  await writeFile(
    jobFilePath(job.jobId),
    `${JSON.stringify(job, null, 2)}\n`,
    "utf8",
  );
}

export async function getJob(jobId) {
  await ensureJobDir();
  const file = await readFile(jobFilePath(jobId), "utf8");
  return JSON.parse(file);
}
