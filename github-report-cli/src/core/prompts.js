export function buildBatchPrompt(batchCommits) {
  return `You are analyzing Git commits for a weekly engineering team update.\nYour job is to identify distinct workstreams or updates the team delivered.\n\nCommits:\n${JSON.stringify(batchCommits, null, 2)}\n\nGroup related commits into weekly workstreams. Be technical and specific.\n\nReturn JSON only, in this exact structure:\n{\n  "features": [\n    {\n      "name": "Short workstream name (3-6 words)",\n      "description": "2-3 sentences - what changed, how it works, and why it matters",\n      "commits": ["abc1234", "def5678"],\n      "technologies": ["React", "PostgreSQL"],\n      "impact": "One sentence on business or technical impact"\n    }\n  ]\n}`;
}

export function buildMergePrompt(allFeatures) {
  return `Below is a list of weekly workstreams extracted from multiple batches of Git commits.\nSome may be duplicates or closely related.\n\nMerge duplicates, combine related workstreams, and return a clean final list.\nKeep the most descriptive version of each. Do not invent new information.\n\nFeatures:\n${JSON.stringify({ features: allFeatures }, null, 2)}\n\nReturn JSON only:\n{ "features": [...] }`;
}
