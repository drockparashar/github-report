import { computePreviousWeekRange } from "../utils/date-range.js";
import { handler as generateHandler } from "./api-generate.js";

export async function handler() {
  const range = computePreviousWeekRange();
  return generateHandler({
    body: JSON.stringify({
      startDate: range.startDate,
      endDate: range.endDate,
    }),
  });
}

if (process.argv[1] && process.argv[1].endsWith("cron-weekly.js")) {
  handler().then((res) => console.log(res.body));
}
