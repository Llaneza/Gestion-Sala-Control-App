import { cshift, dim, mk } from "./dateUtils";

export function countAbsencesForYear(op, year) {
  const counters = { VA: 0, EN: 0, BA: 0 };

  Object.entries(op.calendar || {}).forEach(([dateKey, code]) => {
    if (String(dateKey).startsWith(`${year}-`) && counters[code] !== undefined) {
      counters[code] += 1;
    }
  });

  return counters;
}

export function computeStats(ops, year, asgn, off) {
  return ops.map(op => {
    let sc = 0, nSC = 0;

    for (let mo = 0; mo < 12; mo++) {
      for (let d = 1; d <= dim(year, mo); d++) {
        const k = mk(year, mo + 1, d);
        const t = cshift(year, mo, d, off);
        const a = asgn[k]?.[op.id];

        if (t !== "D" && a === "SC") {
          sc++;
          if (t === "N") nSC++;
        }
      }
    }

    return { ...op, sc, nSC, hSC: sc * 12 };
  });
}