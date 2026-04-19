export function normalizeDateStart(dateValue) {
  if (!dateValue) {
    return undefined;
  }

  const d = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid start date: ${dateValue}`);
  }
  return d.toISOString();
}

export function normalizeDateEnd(dateValue) {
  if (!dateValue) {
    return undefined;
  }

  const d = new Date(`${dateValue}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid end date: ${dateValue}`);
  }
  return d.toISOString();
}

export function computePreviousWeekRange(now = new Date()) {
  const utcNow = new Date(now);
  const day = utcNow.getUTCDay();

  const end = new Date(
    Date.UTC(
      utcNow.getUTCFullYear(),
      utcNow.getUTCMonth(),
      utcNow.getUTCDate() - day,
      23,
      59,
      59,
      999,
    ),
  );

  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
