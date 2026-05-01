export function countAbsencesForYear(op, year) {
  const counters = { VA: 0, EN: 0, BA: 0 };

  Object.entries(op.calendar || {}).forEach(([dateKey, code]) => {
    if (String(dateKey).startsWith(`${year}-`) && counters[code] !== undefined) {
      counters[code] += 1;
    }
  });

  return counters;
}