import { CYCLE, CYCLE_LEN } from "../config/constants";

export const dim = (y, m) => new Date(y, m + 1, 0).getDate();

export const dow = (y, m, d) => {
  const r = new Date(y, m, d).getDay();
  return r === 0 ? 6 : r - 1;
};

const dse = (y, m, d) => Math.round((new Date(y, m, d) - new Date(1970, 0, 1)) / 86400000);

export const mk = (y, m, d) => `${y}-${m}-${d}`;

export function cshift(y, m, d, off = 0) {
  const pos = ((dse(y, m, d) + off) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  return CYCLE[Math.floor(pos / 7)][pos % 7];
}

export function formatDateTime(date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
