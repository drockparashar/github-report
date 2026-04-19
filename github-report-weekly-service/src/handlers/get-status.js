import { getJob } from "../core/job-store.js";

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(event = {}) {
  try {
    const jobId =
      event?.pathParameters?.jobId ||
      event?.queryStringParameters?.jobId ||
      event?.jobId;

    if (!jobId) {
      return response(400, { error: "jobId is required" });
    }

    const job = await getJob(jobId);
    return response(200, job);
  } catch (error) {
    return response(404, { error: error.message });
  }
}

if (process.argv[1] && process.argv[1].endsWith("get-status.js")) {
  const inputJobId = process.argv[2];
  handler({ jobId: inputJobId }).then((res) => console.log(res.body));
}
