import { useState, useMemo, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";
import cortevaLogo from "./Corteva_VerColor_RGB.png";

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAAW-KbrhHIzDyRTgmVjlzPa7TK8o9FeI4",
  authDomain: "app-sala-control.firebaseapp.com",
  projectId: "app-sala-control",
  storageBucket: "app-sala-control.firebasestorage.app",
  messagingSenderId: "622611612673",
  appId: "1:622611612673:web:4200dcddc50292908c2c00"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- UTILIDADES DE SEGURIDAD ---
function simpleHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16);
}

const DEFAULT_ADMINS = [{ user: "admin", passHash: simpleHash("admin1234"), role: "admin" }];

const THEMES = {
  dark: {
    bg: "#08111f",
    shell: "#0b1628",
    card: "rgba(13, 21, 38, 0.82)",
    cardSolid: "#0d1526",
    text: "#d7e3f4",
    title: "#ffffff",
    border: "rgba(90, 116, 148, 0.22)",
    sub: "#7f93ae",
    accent: "#39c89a",
    accentSoft: "rgba(57, 200, 154, 0.14)",
    dangerSoft: "rgba(239, 68, 68, 0.14)"
  },
  light: {
    bg: "#eef4fb",
    shell: "#f8fbff",
    card: "rgba(255, 255, 255, 0.9)",
    cardSolid: "#ffffff",
    text: "#334155",
    title: "#0f172a",
    border: "rgba(148, 163, 184, 0.28)",
    sub: "#64748b",
    accent: "#0f9f78",
    accentSoft: "rgba(15, 159, 120, 0.12)",
    dangerSoft: "rgba(239, 68, 68, 0.12)"
  }
};

const CYCLE = [
  ["M", "M", "D", "D", "N", "N", "N"],
  ["D", "D", "M", "M", "D", "D", "D"],
  ["N", "N", "D", "D", "M", "M", "M"],
  ["D", "D", "N", "N", "D", "D", "D"],
];
const CYCLE_LEN = 28;

const ABSENCE = {
  VA: { label: "Vacaciones", icon: "🌴", color: "#10B981" },
  EN: { label: "Entrenamiento", icon: "📖", color: "#A78BFA" },
  BA: { label: "Baja", icon: "🤒", color: "#F87171" }
};

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW_S = ["L", "M", "X", "J", "V", "S", "D"];
const TURNO_DEF = {
  M: { color: "#F59E0B", label: "Mañana", bg: "#F59E0B15" },
  N: { color: "#818CF8", label: "Noche", bg: "#818CF815" },
  D: { color: "#64748B", label: "Descanso", bg: "transparent" }
};
const EXTRA_VISUALS = { SC: { color: "#34D399", bg: "#34D39925" }, CA: { color: "#475569", bg: "transparent" } };

const dim = (y, m) => new Date(y, m + 1, 0).getDate();
const dow = (y, m, d) => { const r = new Date(y, m, d).getDay(); return r === 0 ? 6 : r - 1; };
const dse = (y, m, d) => Math.round((new Date(y, m, d) - new Date(1970, 0, 1)) / 86400000);
const mk = (y, m, d) => `${y}-${m}-${d}`;

function cshift(y, m, d, off = 0) {
  const pos = ((dse(y, m, d) + off) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  return CYCLE[Math.floor(pos / 7)][pos % 7];
}

// --- FUNCIÓN DE AUTOASIGNACIÓN ---
function autoAssign(ops, targetYear, off) {

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

// --- ICONOS Y COMPONENTES VISUALES ---
const EyeIcon = ({ visible, color }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {visible ? (<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></>) : (<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></>)}
  </svg>
);

const Av = ({ name, color, size = 24 }) => (
  <div style={{ width: size, height: size, borderRadius: 8, background: color || '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: '#000', fontWeight: 'bold', flexShrink: 0 }}>
    {name?.substring(0, 2).toUpperCase() || "??"}
  </div>
);

function computeStats(ops, year, asgn, off) {
  return ops.map(op => {
    let sc = 0, nSC = 0;
    for (let mo = 0; mo < 12; mo++) for (let d = 1; d <= dim(year, mo); d++) {
      const k = mk(year, mo + 1, d), t = cshift(year, mo, d, off), a = asgn[k]?.[op.id];
      if (t !== "D" && a === "SC") { sc++; if (t === "N") nSC++; }
    }
    return { ...op, sc, nSC, hSC: sc * 12 };
  });
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function countAbsencesForYear(op, year) {
  const counters = { VA: 0, EN: 0, BA: 0 };
  Object.entries(op.calendar || {}).forEach(([dateKey, code]) => {
    if (String(dateKey).startsWith(`${year}-`) && counters[code] !== undefined) {
      counters[code] += 1;
    }
  });
  return counters;
}

function PrintableHeader({ year, title, subtitle, generatedAt, generatedBy, operator }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 24, paddingBottom: 18, borderBottom: "2px solid #dbeafe" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <img src={cortevaLogo} alt="Corteva" style={{ width: 88, height: "auto", objectFit: "contain" }} />
        <div>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em", color: "#2563eb", marginBottom: 6 }}>CORTEVA</div>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>{title}</h1>
          <div style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>{subtitle}</div>
          {operator && <div style={{ marginTop: 6, fontSize: 13, color: "#0f172a", fontWeight: 700 }}>Operador: {operator.name}</div>}
        </div>
      </div>
      <div style={{ minWidth: 220, background: "#f8fafc", border: "1px solid #dbeafe", borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: 8 }}>Documento</div>
        <div style={{ fontSize: 13, marginBottom: 5 }}><strong>Año:</strong> {year}</div>
        <div style={{ fontSize: 13, marginBottom: 5 }}><strong>Generado:</strong> {generatedAt}</div>
        <div style={{ fontSize: 13 }}><strong>Usuario:</strong> {generatedBy}</div>
      </div>
    </div>
  );
}

function PrintableLegend() {
  const items = [
    { label: "SC asignado", bg: "#dcfce7", color: "#166534" },
    { label: "Mañana", bg: "#fef3c7", color: "#92400e" },
    { label: "Noche", bg: "#e0e7ff", color: "#3730a3" },
    { label: "Vacaciones / ausencia", bg: "#ecfccb", color: "#14532d" }
  ];

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #cbd5e1", borderRadius: 999, padding: "7px 12px" }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: item.bg, border: `1px solid ${item.color}` }} />
          <span style={{ fontSize: 12, color: "#334155" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function PrintableMonthTable({ ops, year, monthIndex, asgn, off }) {
  const monthName = MONTHS[monthIndex];
  return (
    <div key={monthName} style={{ marginBottom: 28, breakInside: "avoid-page" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{monthName}</h2>
        <span style={{ fontSize: 12, color: "#64748b" }}>Turnos y ausencias</span>
      </div>

      <div style={{ overflow: "hidden", border: "1px solid #cbd5e1", borderRadius: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: `140px repeat(${dim(year, monthIndex)}, minmax(24px, 1fr))`, width: "100%" }}>
          <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, background: "#f8fafc", borderRight: "1px solid #cbd5e1", borderBottom: "1px solid #cbd5e1" }}>
            Operador
          </div>
          {Array.from({ length: dim(year, monthIndex) }).map((_, dayIndex) => {
            const day = dayIndex + 1;
            const rotHeader = cshift(year, monthIndex, day, off);
            return (
              <div key={day} style={{ padding: "6px 0", borderRight: "1px solid #e2e8f0", borderBottom: "1px solid #cbd5e1", textAlign: "center", background: "#f8fafc" }}>
                <div style={{ fontSize: 9, color: dow(year, monthIndex, day) >= 5 ? "#dc2626" : "#64748b" }}>{DOW_S[dow(year, monthIndex, day)]}</div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{day}</div>
                <div style={{ fontSize: 9, color: TURNO_DEF[rotHeader]?.color || "#64748b" }}>{rotHeader === "D" ? "" : rotHeader}</div>
              </div>
            );
          })}

          {ops.map(op => (
            <div key={op.id} style={{ display: "contents" }}>
              <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, borderRight: "1px solid #cbd5e1", borderBottom: "1px solid #e2e8f0", background: "#ffffff" }}>
                {op.name}
              </div>
              {Array.from({ length: dim(year, monthIndex) }).map((_, dayIndex) => {
                const day = dayIndex + 1;
                const dateKey = mk(year, monthIndex + 1, day);
                const absence = op.calendar?.[dateKey];
                const rotation = cshift(year, monthIndex, day, off);
                const assignment = asgn[dateKey]?.[op.id];
                const finalCode = absence || assignment || rotation;

                let background = "#ffffff";
                let color = "#0f172a";

                if (absence) {
                  background = `${ABSENCE[absence].color}33`;
                } else if (assignment === "SC") {
                  background = "#dcfce7";
                  color = "#166534";
                } else if (rotation === "M") {
                  background = "#fef3c7";
                  color = "#92400e";
                } else if (rotation === "N") {
                  background = "#e0e7ff";
                  color = "#3730a3";
                }

                return (
                  <div
                    key={dateKey}
                    style={{
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRight: "1px solid #e2e8f0",
                      borderBottom: "1px solid #e2e8f0",
                      fontSize: 10,
                      fontWeight: finalCode !== "D" ? 700 : 500,
                      background,
                      color
                    }}
                  >
                    {finalCode}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PrintableIndividualCalendar({ operator, year, asgn, off, generatedAt, generatedBy, statsItem }) {
  const absences = countAbsencesForYear(operator, year);
  return (
    <section className="print-only" style={{ padding: 24, color: "#0f172a", background: "#ffffff" }}>
      <PrintableHeader
        year={year}
        title={`Calendario individual ${year}`}
        subtitle="Planificación anual individual para consulta, impresión o archivo PDF."
        generatedAt={generatedAt}
        generatedBy={generatedBy}
        operator={operator}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 20 }}>
        <div style={{ padding: 14, borderRadius: 14, background: "#f8fafc", border: "1px solid #dbeafe" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Horas SC</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{statsItem?.hSC || 0}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 14, background: "#f8fafc", border: "1px solid #dbeafe" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>SC</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{statsItem?.sc || 0}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 14, background: "#f8fafc", border: "1px solid #dbeafe" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Noches</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{statsItem?.nSC || 0}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 14, background: "#f8fafc", border: "1px solid #dbeafe" }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Ausencias</div>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.6 }}>
            VA {absences.VA} · EN {absences.EN} · BA {absences.BA}
          </div>
        </div>
      </div>

      <PrintableLegend />
      {MONTHS.map((_, monthIndex) => <PrintableMonthTable key={monthIndex} ops={[operator]} year={year} monthIndex={monthIndex} asgn={asgn} off={off} />)}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #cbd5e1", fontSize: 11, color: "#64748b" }}>
        Documento generado automáticamente por Sala de Control · CORTEVA
      </div>
    </section>
  );
}

function PrintableYearCalendar({ ops, year, asgn, off, generatedAt, generatedBy }) {
  return (
    <section className="print-only" style={{ padding: 24, color: "#0f172a", background: "#ffffff" }}>
      <PrintableHeader
        year={year}
        title={`Calendario anual ${year}`}
        subtitle="Planificación general de personal para consulta, archivo o impresión."
        generatedAt={generatedAt}
        generatedBy={generatedBy}
      />
      <PrintableLegend />
      {MONTHS.map((_, monthIndex) => <PrintableMonthTable key={monthIndex} ops={ops} year={year} monthIndex={monthIndex} asgn={asgn} off={off} />)}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #cbd5e1", fontSize: 11, color: "#64748b" }}>
        Documento generado automáticamente por Sala de Control · CORTEVA
      </div>
    </section>
  );
}

// --- APP PRINCIPAL ---
export default function App() {
  const today = new Date();
  const [session, setSession] = useState(null);
  const [admins, setAdmins] = useState(DEFAULT_ADMINS);
  const [ops, setOps] = useState([]);
  const [off, setOff] = useState(-11);
  const [view, setView] = useState("calendar");
  const [activeYear, setAY] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [themeMode, setThemeMode] = useState('dark');
  const [manualTheme, setManualTheme] = useState(false);
  const [showConfigPass, setShowConfigPass] = useState(false);
  const [printMode, setPrintMode] = useState("annual");
  const [printOpId, setPrintOpId] = useState("");

  useEffect(() => {
    onValue(ref(db, 'ops'), (s) => { if (s.val()) setOps(s.val()); });
    onValue(ref(db, 'admins'), (s) => { if (s.val()) setAdmins(s.val()); });
    onValue(ref(db, 'offset'), (s) => { if (s.val() !== null) setOff(s.val()); });
  }, []);

  const saveOps = (n) => set(ref(db, 'ops'), n);
  const saveAdmins = (n) => set(ref(db, 'admins'), n);
  const saveOff = (n) => set(ref(db, 'offset'), n);

  useEffect(() => {
    if (!manualTheme) {
      const hour = new Date().getHours();
      setThemeMode(hour >= 8 && hour < 20 ? 'light' : 'dark');
    }
  }, [manualTheme]);

  const t = THEMES[themeMode];
  const isSuper = session?.role === "superadmin";
const isAdmin = session?.role === "admin" || isSuper;
const canEdit = isAdmin || session?.role === "editor";
const canSeeEditor = canEdit || session?.role === "guest";

const roleLabels = {
  guest: "Invitado",
  admin: "Administrador",
  superadmin: "Administrador",
  editor: "Editor"
};

const sessionDisplayName =
  session?.role === "guest"
    ? "Invitado"
    : session?.role === "editor"
      ? "Editor"
      : isAdmin
        ? "Admin"
        : (session?.user || "");

const sessionDisplayRole = session?.role === "guest" ? "" : (roleLabels[session?.role] || "");

const profileDisplayRole = session?.role === "guest" ? "Invitado" : (roleLabels[session?.role] || "");

  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);
  const currentMonthLabel = `${MONTHS[month]} ${activeYear}`;
  const selectedPrintOp = useMemo(() => ops.find(op => String(op.id) === String(printOpId)) || ops[0] || null, [ops, printOpId]);
  const selectedPrintStats = useMemo(() => stats.find(op => String(op.id) === String(selectedPrintOp?.id)), [stats, selectedPrintOp]);
  const generatedAt = formatDateTime(new Date());
  const todayKey = mk(today.getFullYear(), today.getMonth() + 1, today.getDate());

  useEffect(() => {
    if (!printOpId && ops[0]?.id) {
      setPrintOpId(String(ops[0].id));
    }
  }, [ops, printOpId]);

  const handlePrevMonth = () => { if (month === 0) { setMonth(11); setAY(v => v - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 11) { setMonth(0); setAY(v => v + 1); } else setMonth(month + 1); };

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{
      minHeight: "100vh",
      background: `radial-gradient(circle at top left, ${t.accentSoft}, transparent 32%), radial-gradient(circle at top right, rgba(99, 102, 241, 0.10), transparent 24%), linear-gradient(180deg, ${t.shell} 0%, ${t.bg} 55%, ${t.bg} 100%)`,
      color: t.text,
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      transition: 'background 0.3s'
    }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; color: black !important; }
          .app-shell { max-width: none !important; padding: 0 !important; }
          .calendar-container { display: none !important; }
          @page { size: A4 landscape; margin: 12mm; }
        }
        .app-shell { max-width: 1440px; margin: 0 auto; padding: 24px 14px 40px; }
        .glass-panel { background: ${t.card}; border: 1px solid ${t.border}; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .hero-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 24px; }
        .hero-card { border-radius: 22px; padding: 22px; }
        .hero-title { font-size: 28px; font-weight: 800; color: ${t.title}; margin: 0 0 8px; letter-spacing: -0.02em; }
        .hero-sub { color: ${t.sub}; font-size: 14px; line-height: 1.5; margin: 0; }
        .hero-kpi-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${t.sub}; margin-bottom: 8px; }
        .hero-kpi-value { font-size: 28px; font-weight: 800; color: ${t.title}; }
        .section-card { border-radius: 20px; }
        .calendar-container { background: ${t.card}; border-radius: 20px; overflow-x: auto; border: 1px solid ${t.border}; margin-bottom: 40px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); position: relative; -webkit-overflow-scrolling: touch; }
        .calendar-grid { display: grid; grid-template-columns: 140px repeat(${dim(activeYear, month)}, minmax(46px, 1fr)); gap: 0px; width: max-content; min-width: 100%; }
        @media (min-width: 1024px) { .calendar-grid { width: 100%; grid-template-columns: 150px repeat(${dim(activeYear, month)}, 1fr); } .cell-day { min-width: 0 !important; } }
        @media (max-width: 980px) { .hero-grid { grid-template-columns: 1fr; } }
        .sticky-col { position: sticky; left: 0; background: ${t.cardSolid} !important; z-index: 50; border-right: 1px solid ${t.border} !important; box-sizing: border-box; }
        .cell-day { height: 40px; display: flex; align-items: center; justify-content: center; border-top: 1px solid ${t.border}; border-right: 1px solid ${t.border}; font-size: 11px; box-sizing: border-box; }
        .header-day { height: 58px !important; flex-direction: column; gap: 2px; background: ${t.shell} !important; }
        .soft-button { background: ${t.card}; color: ${t.text}; border: 1px solid ${t.border}; border-radius: 12px; padding: 10px 14px; cursor: pointer; fontSize: 12px; }
        .soft-input { width: 100%; border-radius: 12px; border: 1px solid ${t.border}; background: ${t.shell}; color: ${t.text}; }
        .print-only { display: none; }
      `}</style>

      <header className="no-print glass-panel" style={{ margin: '14px 14px 0', padding: "14px 18px", display: 'flex', justifyContent: 'space-between', borderRadius: 22, alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ padding: '10px 14px', borderRadius: 14, background: t.accentSoft, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.sub }}>Panel</div>
            <span style={{ fontWeight: 800, color: t.title, fontSize: 18, letterSpacing: '0.02em' }}>Sala de Control</span>
          </div>
          <button onClick={() => { setManualTheme(true); setThemeMode(themeMode === 'dark' ? 'light' : 'dark'); }} style={{ background: t.shell, border: `1px solid ${t.border}`, borderRadius: 12, padding: '9px 12px', cursor: 'pointer', color: t.text, fontWeight: 700 }}>{themeMode === 'dark' ? 'Modo claro' : 'Modo oscuro'}</button>
          <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.shell, color: t.text, border: `1px solid ${t.border}`, borderRadius: 12, padding: '9px 12px', fontSize: 13, minWidth: 110 }}>
            {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ padding: '10px 14px', borderRadius: 14, background: t.shell, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, color: t.sub, marginBottom: 3 }}>Sesión activa</div>
<div style={{ fontSize: 13, fontWeight: 700, color: t.title }}>{sessionDisplayRole || sessionDisplayName}</div>
          </div>
          <button onClick={() => setSession(null)} style={{ background: t.dangerSoft, color: '#EF4444', border: `1px solid rgba(239, 68, 68, 0.24)`, padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>Cerrar sesión</button>
        </div>
      </header>

      <nav className="no-print glass-panel" style={{ display: 'flex', margin: '14px 14px 0', padding: 8, borderRadius: 18, justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: 820, gap: 8, flexWrap: 'wrap' }}>
          {["calendar", "stats", canSeeEditor && "editor", isAdmin && "config"].filter(Boolean).map(v => {
  const labels = {
    calendar: "Calendario",
    stats: "Estadísticas",
    editor: "Editor",
    config: "Administración"
  };
  return (
    <button
      key={v}
      onClick={() => setView(v)}
      style={{
        flex: 1,
        padding: '13px 12px',
        color: view === v ? t.title : t.sub,
        background: view === v ? t.accentSoft : 'transparent',
        border: `1px solid ${view === v ? t.border : 'transparent'}`,
        cursor: 'pointer',
        fontWeight: 'bold',
        borderRadius: 12,
        fontSize: 12
      }}
    >
      {labels[v]}
    </button>
  );
})}
        </div>
      </nav>

      <main className="app-shell">
        <section className="hero-grid no-print">
          <div className="glass-panel hero-card" style={{ background: `linear-gradient(135deg, ${t.card} 0%, ${t.accentSoft} 100%)` }}>
  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: t.accent, marginBottom: 12 }}>Gestión de personal</div>
  <h1 className="hero-title">Vista operativa de turnos, ausencias y control diario.</h1>
</div>
          <div className="glass-panel hero-card">
            <div className="hero-kpi-label">Operadores</div>
            <div className="hero-kpi-value">{ops.length}</div>
            <div className="hero-sub">Personal cargado en la base de datos.</div>
          </div>
          <div className="glass-panel hero-card">
            <div className="hero-kpi-label">Periodo visible</div>
            <div className="hero-kpi-value" style={{ fontSize: 22 }}>{currentMonthLabel}</div>
            <div className="hero-sub">Mes y año activos en pantalla.</div>
          </div>
          <div className="glass-panel hero-card">
            <div className="hero-kpi-label">Perfil</div>
            <div className="hero-kpi-value" style={{ fontSize: 22 }}>{profileDisplayRole}</div>
            <div className="hero-sub">Permisos activos de la sesión actual.</div>
          </div>
        </section>

        {view === "calendar" && (
          <div>
            <div className="glass-panel section-card no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 20, alignItems: 'center', padding: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.sub, marginBottom: 6 }}>Calendario operativo</div>
                <h2 style={{ margin: 0, minWidth: 120, textAlign: 'center', fontSize: 24, color: t.title, letterSpacing: '-0.02em' }}>{currentMonthLabel}</h2>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text, cursor: 'pointer', fontSize: 12, fontWeight: 700 }} onClick={handlePrevMonth}>Mes anterior</button>
                <button style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.accentSoft, color: t.title, cursor: 'pointer', fontSize: 12, fontWeight: 700 }} onClick={handleNextMonth}>Mes siguiente</button>
                <select value={printMode} onChange={e => setPrintMode(e.target.value)} style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text, fontSize: 12, minWidth: 210 }}>
                  <option value="annual">Exportación anual completa</option>
                  <option value="individual">Calendario individual</option>
                </select>
                {printMode === "individual" && (
                  <select value={printOpId} onChange={e => setPrintOpId(e.target.value)} style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text, fontSize: 12, minWidth: 220 }}>
                    {ops.map(op => <option key={op.id} value={String(op.id)}>{op.name}</option>)}
                  </select>
                )}
                <button
                  style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.cardSolid, color: t.text, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  onClick={() => window.print()}
                >
                  Exportar PDF / Imprimir
                </button>
              </div>
            </div>

            <div className="calendar-container">
              <div className="calendar-grid">
                <div className="sticky-col" style={{ height: 55, borderBottom: `1px solid ${t.border}` }} />
                {Array.from({ length: dim(activeYear, month) }).map((_, i) => {
  const dayNumber = i + 1;
  const rotHeader = cshift(activeYear, month, dayNumber, off);
  const headerDateKey = mk(activeYear, month + 1, dayNumber);
  const isToday = headerDateKey === todayKey;

  return (
    <div
      key={i}
      className="cell-day header-day"
      style={{
        background: isToday ? t.accentSoft : undefined,
        boxShadow: isToday ? `inset 0 0 0 2px ${t.accent}` : undefined,
        borderRadius: isToday ? 12 : undefined
      }}
    >
      <span style={{ color: dow(activeYear, month, dayNumber) >= 5 ? '#EF4444' : t.sub, fontSize: 9 }}>
        {DOW_S[dow(activeYear, month, dayNumber)]}
      </span>
      <span style={{ fontWeight: 'bold', fontSize: 11 }}>{dayNumber}</span>
      <span style={{ fontSize: 9, fontWeight: '800', color: TURNO_DEF[rotHeader]?.color }}>
        {rotHeader === 'D' ? '' : rotHeader}
      </span>
    </div>
  );
})}
                {ops.map(op => (
                  <div key={op.id} style={{ display: 'contents' }}>
                    <div className="sticky-col" style={{ padding: '10px 12px', fontSize: 12, borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Av name={op.name} color={op.color} size={18} />
                      <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{op.name}</span>
                    </div>
                    {Array.from({ length: dim(activeYear, month) }).map((_, i) => {
  const dk = mk(activeYear, month + 1, i + 1);
  const abs = op.calendar?.[dk];
  const rot = cshift(activeYear, month, i + 1, off);
  const calcAsgn = asgn[dk]?.[op.id];
  const finalCode = abs || calcAsgn || rot;
  const isToday = dk === todayKey;

  let cellBg = "transparent", cellColor = t.text;
  if (abs) { cellBg = ABSENCE[abs].color; cellColor = "#000"; }
  else if (calcAsgn === "SC") { cellBg = EXTRA_VISUALS.SC.bg; cellColor = EXTRA_VISUALS.SC.color; }
  else if (TURNO_DEF[rot]) { cellBg = TURNO_DEF[rot].bg; cellColor = TURNO_DEF[rot].color; }

  return (
    <div
      key={i}
      className="cell-day"
      style={{
        borderTop: `1px solid ${t.border}`,
        background: cellBg,
        color: cellColor,
        fontWeight: rot !== 'D' || abs || calcAsgn === 'SC' ? 'bold' : 'normal',
        boxShadow: isToday ? `inset 0 0 0 2px ${t.accent}` : undefined
      }}
    >
      {finalCode}
    </div>
  );
})}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === "calendar" && printMode === "annual" && (
          <PrintableYearCalendar
            ops={ops}
            year={activeYear}
            asgn={asgn}
            off={off}
            generatedAt={generatedAt}
            generatedBy={session.user}
          />
        )}

        {view === "calendar" && printMode === "individual" && selectedPrintOp && (
          <PrintableIndividualCalendar
            operator={selectedPrintOp}
            year={activeYear}
            asgn={asgn}
            off={off}
            generatedAt={generatedAt}
            generatedBy={session.user}
            statsItem={selectedPrintStats}
          />
        )}

        {view === "stats" && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {stats.sort((a,b) => b.nSC - a.nSC || b.hSC - a.hSC).map(s => (
              <div key={s.id} className="glass-panel section-card" style={{ padding: 25 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}><Av name={s.name} color={s.color} size={36} /><div><div style={{ fontWeight: 'bold', color: t.title, fontSize: 18 }}>{s.name}</div><div style={{ fontSize: 12, color: t.sub }}>Resumen anual de servicio</div></div></div>
                <div style={{ fontSize: 34, fontWeight: 800, color: t.title, marginBottom: 6 }}>{s.sc} SC</div>
                <div style={{ fontSize: 14, color: t.sub, marginBottom: 16 }}>{s.hSC} horas totales asignadas</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 12, color: t.sub }}>Noches</span>
                  <strong style={{ color: t.accent, fontSize: 18 }}>{s.nSC}</strong>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} canEdit={canEdit} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
            <div className="glass-panel section-card" style={{ padding: 25 }}>
              <h3 style={{ color: t.title, marginTop: 0 }}>OPERADORES</h3>
              <p style={{ color: t.sub, fontSize: 13, marginTop: 0, marginBottom: 18 }}>Alta y baja de personal operativo disponible en el sistema.</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input id="newOpN" placeholder="Nombre..." style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
                <button onClick={() => { const n = document.getElementById('newOpN').value; if(n) { saveOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {} }]); document.getElementById('newOpN').value = ''; } }} style={{ padding: '0 20px', background: t.accentSoft, color: t.title, border: `1px solid ${t.border}`, borderRadius: 12, fontWeight: 'bold', cursor: 'pointer' }}>AÑADIR</button>
              </div>
              {ops.map(o => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${t.border}`, alignItems: 'center' }}><span style={{ fontWeight: 600 }}>{o.name}</span><button onClick={() => saveOps(ops.filter(x => x.id !== o.id))} style={{ color: '#EF4444', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18 }}>×</button></div>)}
            </div>

            <div className="glass-panel section-card" style={{ padding: 25 }}>
              <h3 style={{ color: t.title, marginTop: 0 }}>OFFSET</h3>
              <p style={{ color: t.sub, fontSize: 13, marginTop: 0, marginBottom: 12 }}>Valor actual de desfase aplicado al ciclo base.</p>
              <div style={{ fontSize: 30, fontWeight: 800, color: t.accent, marginBottom: 16 }}>{off}</div>
              <input type="number" value={off} onChange={e => saveOff(Number(e.target.value))} style={{ padding: 12, width: '100%', borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
            </div>

            {isSuper && (
              <div className="glass-panel section-card" style={{ padding: 25 }}>
              <h3 style={{ color: t.title, marginTop: 0 }}>GESTIÓN DE ACCESOS</h3>
                <p style={{ color: t.sub, fontSize: 13, marginTop: 0, marginBottom: 18 }}>Creación y retirada de usuarios con permisos administrativos o de edición.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  <input id="newU" placeholder="Usuario" style={{ padding: 10, borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input id="newP" type={showConfigPass ? "text" : "password"} placeholder="Contraseña" style={{ flex: 1, padding: 10, paddingRight: 40, borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
                    <button onClick={() => setShowConfigPass(!showConfigPass)} style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><EyeIcon visible={showConfigPass} color={t.sub} /></button>
                  </div>
                  <select id="newR" style={{ padding: 10, borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }}><option value="admin">Administrador</option><option value="editor">Editor</option></select>
                  <button onClick={() => {
                    const u = document.getElementById('newU').value, p = document.getElementById('newP').value, r = document.getElementById('newR').value;
                    if(u && p) { saveAdmins([...admins, { user: u, passHash: simpleHash(p), role: r }]); document.getElementById('newU').value = ''; document.getElementById('newP').value = ''; }
                  }} style={{ padding: 12, background: t.accentSoft, color: t.title, border: `1px solid ${t.border}`, borderRadius: 12, fontWeight: 'bold', cursor: 'pointer' }}>CREAR</button>
                </div>
                {admins.map(a => (
                  <div key={a.user} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${t.border}`, fontSize: 12 }}>
                    <span>{a.user} <strong style={{ color: t.accent }}>({a.role})</strong></span>
                    {a.role !== 'superadmin' && <button onClick={() => saveAdmins(admins.filter(x => x.user !== a.user))} style={{ color: '#EF4444', border: 'none', background: 'none', cursor: 'pointer' }}>×</button>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function EditorComponent({ ops, saveOps, activeYear, theme: t, off, canEdit }) {
  const [selOp, setSelOp] = useState(ops[0]?.id);
  const [selAb, setSelAb] = useState("VA");
  const toggleAbsence = (dateKey) => {
    if (!canEdit) return;
    const newOps = ops.map(o => {
      if (o.id !== selOp) return o;
      const newCal = { ...(o.calendar || {}) };
      newCal[dateKey] === selAb ? delete newCal[dateKey] : newCal[dateKey] = selAb;
      return { ...o, calendar: newCal };
    });
    saveOps(newOps);
  };

  return (
    <div className="glass-panel section-card" style={{ padding: 25 }}>
      {!canEdit && <p style={{ color: '#EF4444', fontSize: 12, marginBottom: 15, fontWeight: 'bold' }}>MODO LECTURA</p>}
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 8px', color: t.title }}>Editor de ausencias</h3>
        <p style={{ margin: 0, color: t.sub, fontSize: 13 }}>Selecciona un operador y marca vacaciones, entrenamiento o baja sin afectar a la lógica base del calendario.</p>
      </div>
      <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ padding: 12, width: '100%', background: t.shell, color: t.text, border: `1px solid ${t.border}`, borderRadius: 12, marginBottom: 20 }}>
        {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.keys(ABSENCE).map(k => (
          <button key={k} onClick={() => setSelAb(k)} style={{ background: selAb === k ? ABSENCE[k].color : 'transparent', border: `2px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, padding: '10px 14px', borderRadius: 12, cursor: 'pointer', fontWeight: 'bold' }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.shell, padding: 14, borderRadius: 16, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>{m.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const k = mk(activeYear, mi + 1, di + 1), status = ops.find(o => o.id === selOp)?.calendar?.[k], rot = cshift(activeYear, mi, di + 1, off);
                return <div key={di} onClick={() => toggleAbsence(k)} style={{ height: 32, background: status ? ABSENCE[status].color : t.card, borderBottom: `3px solid ${TURNO_DEF[rot]?.color || 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, cursor: canEdit ? 'pointer' : 'default', borderRadius: 4, color: status ? '#000' : t.text }}>{di+1}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginScreen({ admins, onLogin, theme: t }) {
  const [user, setUser] = useState(""), [pass, setPass] = useState(""), [showPass, setShowPass] = useState(false);
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at top left, ${t.accentSoft}, transparent 32%), linear-gradient(180deg, ${t.shell} 0%, ${t.bg} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="glass-panel" style={{ padding: 40, borderRadius: 28, width: "100%", maxWidth: 430 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: t.accent, marginBottom: 10, textAlign: 'center' }}>Acceso seguro</div>
          <h2 style={{ textAlign: 'center', color: t.title, marginBottom: 10, marginTop: 0, fontSize: 30 }}>Sala de Control</h2>
          <p style={{ textAlign: 'center', color: t.sub, margin: 0, fontSize: 14 }}>Accede al panel de turnos y gestión de personal.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ padding: 14, borderRadius: 14, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" style={{ flex: 1, padding: 14, paddingRight: 45, borderRadius: 14, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
            <button onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><EyeIcon visible={showPass} color={t.sub} /></button>
          </div>
          <button onClick={() => { const f = admins.find(a => a.user === user && a.passHash === simpleHash(pass)); if(f) onLogin(f); else alert("Acceso denegado"); }} style={{ padding: 16, background: t.accentSoft, color: t.title, borderRadius: 14, border: `1px solid ${t.border}`, fontWeight: 'bold', cursor: 'pointer' }}>ENTRAR</button>
          <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ background: 'none', border: 'none', color: t.sub, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Modo lectura</button>
        </div>
      </div>
    </div>
  );
}
