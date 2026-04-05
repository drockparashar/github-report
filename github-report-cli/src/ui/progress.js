function nowLabel() {
  return new Date().toISOString().slice(11, 19);
}

export function logStage(message) {
  console.log(`[${nowLabel()}] ${message}`);
}

export function logSubstage(message) {
  console.log(`  -> ${message}`);
}

export function logSummary(title, value) {
  console.log(`${title}: ${value}`);
}
