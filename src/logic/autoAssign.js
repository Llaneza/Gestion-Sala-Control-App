// ======================================================
// NO TOCAR ESTE ARCHIVO SALVO PETICIÓN EXPRESA.
// Algoritmo principal de planificación de turnos.
//
// Este archivo contiene la lógica automática de asignación.
// Cualquier cambio aquí puede alterar el reparto del calendario.
// ======================================================

const CYCLE = [
  ["M", "M", "D", "D", "N", "N", "N"],
  ["D", "D", "M", "M", "D", "D", "D"],
  ["N", "N", "D", "D", "M", "M", "M"],
  ["D", "D", "N", "N", "D", "D", "D"],
];
const CYCLE_LEN = 28;

const dim = (y, m) => new Date(y, m + 1, 0).getDate();
const dse = (y, m, d) => Math.round((new Date(y, m, d) - new Date(1970, 0, 1)) / 86400000);
const mk = (y, m, d) => `${y}-${m}-${d}`;

function cshift(y, m, d, off = 0) {
  const pos = ((dse(y, m, d) + off) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  return CYCLE[Math.floor(pos / 7)][pos % 7];
}

// --- FUNCIÓN DE AUTOASIGNACIÓN ---
export function autoAssign(ops, targetYear, off) {

  // --- PREPARACIÓN ---
  const days = [];

  for (let mo = 0; mo < 12; mo++) {
    for (let d = 1; d <= dim(targetYear, mo); d++) {
      const k = mk(targetYear, mo + 1, d);
      const shift = cshift(targetYear, mo, d, off);
      if (shift !== "D") days.push({ k, shift });
    }
  }

  const opIds = ops.map(o => o.id);

  // --- ESTADO ---
  function createState(assign) {
    const s = {};
    opIds.forEach(id => {
      s[id] = { h: 0, n: 0, streak: 0, last: -10 };
    });

    days.forEach((day, di) => {
      opIds.forEach(id => {
        if (assign[day.k][id] === "SC") {
          s[id].h += 12;
          if (day.shift === "N") s[id].n++;

          if (s[id].last === di - 1) s[id].streak++;
          else s[id].streak = 1;

          s[id].last = di;
        } else {
          s[id].streak = 0;
        }
      });
    });

    return s;
  }

  // --- DETECTAR RACHAS COMPLETAS ---
  function getStreaks(assign) {
    const streaks = [];
    const perOp = {};

    ops.forEach(op => perOp[op.id] = []);

    days.forEach((day, di) => {
      ops.forEach(op => {
        if (assign[day.k][op.id] === "SC") {
          perOp[op.id].push(di);
        }
      });
    });

    Object.values(perOp).forEach(arr => {
      if (arr.length === 0) return;

      let current = 1;

      for (let i = 1; i < arr.length; i++) {
        if (arr[i] === arr[i - 1] + 1) {
          current++;
        } else {
          streaks.push(current);
          current = 1;
        }
      }
      streaks.push(current);
    });

    return streaks;
  }

  // --- INICIALIZACIÓN (SIEMPRE 2 SC) ---
  let assign = {};

  days.forEach(day => {
    assign[day.k] = {};

    const available = ops.filter(o => !o.calendar?.[day.k]);
    const shuffled = [...available].sort(() => Math.random() - 0.5);

    const selected = shuffled.slice(0, 2);

    ops.forEach(op => {
      assign[day.k][op.id] = selected.includes(op) ? "SC" : "CA";
    });
  });

  // --- FUNCIÓN DE COSTE ---
  function cost(assign) {
    const s = createState(assign);

    const hs = Object.values(s).map(x => x.h);
    const ns = Object.values(s).map(x => x.n);

    const avgH = hs.reduce((a, b) => a + b, 0) / hs.length;
    const avgN = ns.reduce((a, b) => a + b, 0) / ns.length;

    let cost = 0;

    // NOCHES (PRIORIDAD MÁXIMA)
    ns.forEach(n => {
      cost += Math.pow(n - avgN, 2) * 15;
    });

    // HORAS
    hs.forEach(h => {
      cost += Math.pow(h - avgH, 2) * 3;
    });

    // RACHAS COMPLETAS (FORMA)
    const streaks = getStreaks(assign);

    streaks.forEach(len => {
      if (len === 1) cost += 80;
      else if (len === 2) cost += 40;
      else if (len === 3) cost += 15;
      else if (len === 4) cost += 0;
      else if (len === 5) cost += 20;
      else if (len === 6) cost += 50;
      else if (len > 6) cost += 10000;
    });

    return cost;
  }

  // --- VALIDACIÓN DURA ---
  function isValid(assign) {
    const s = createState(assign);
    return Object.values(s).every(x => x.streak <= 6);
  }

  // --- OPTIMIZACIÓN ---
  let best = JSON.parse(JSON.stringify(assign));
  let bestCost = cost(best);

  for (let iter = 0; iter < 8000; iter++) {

    const newAssign = JSON.parse(JSON.stringify(best));

    const d = days[Math.floor(Math.random() * days.length)];
    const scOps = opIds.filter(id => newAssign[d.k][id] === "SC");
    const caOps = opIds.filter(id => newAssign[d.k][id] === "CA");

    if (scOps.length < 2 || caOps.length === 0) continue;

    const out = scOps[Math.floor(Math.random() * scOps.length)];
    const inp = caOps[Math.floor(Math.random() * caOps.length)];

    // evitar asignar a alguien con ausencia
    const opIn = ops.find(o => o.id === inp);
    if (opIn.calendar?.[d.k]) continue;

    // swap
    newAssign[d.k][out] = "CA";
    newAssign[d.k][inp] = "SC";

    if (!isValid(newAssign)) continue;

    const newCost = cost(newAssign);

    if (newCost < bestCost) {
      best = newAssign;
      bestCost = newCost;
    }
  }

  return best;
}

