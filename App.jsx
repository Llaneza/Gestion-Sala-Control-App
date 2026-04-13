import { useState, useMemo, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

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

const DEFAULT_ADMINS = [{ user: "admin", passHash: simpleHash("admin1234"), role: "superadmin" }];

const THEMES = {
  dark: { bg: "#080F1E", card: "#0D1526", text: "#CBD5E1", title: "#FFFFFF", border: "#1E2D45", sub: "#475569", accent: "#34D399" },
  light: { bg: "#F1F5F9", card: "#FFFFFF", text: "#334155", title: "#0F172A", border: "#CBD5E1", sub: "#64748B", accent: "#059669" }
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

  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

  const handlePrevMonth = () => { if (month === 0) { setMonth(11); setAY(v => v - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 11) { setMonth(0); setAY(v => v + 1); } else setMonth(month + 1); };

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace', transition: 'background 0.3s' }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white !important; color: black !important; } }
        .calendar-container { background: ${t.card}; border-radius: 12px; overflow-x: auto; border: 1px solid ${t.border}; margin-bottom: 40px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); position: relative; -webkit-overflow-scrolling: touch; }
        .calendar-grid { display: grid; grid-template-columns: 140px repeat(${dim(activeYear, month)}, minmax(46px, 1fr)); gap: 0px; width: max-content; min-width: 100%; }
        @media (min-width: 1024px) { .calendar-grid { width: 100%; grid-template-columns: 150px repeat(${dim(activeYear, month)}, 1fr); } .cell-day { min-width: 0 !important; } }
        .sticky-col { position: sticky; left: 0; background: ${t.card} !important; z-index: 50; border-right: 2px solid ${t.border} !important; box-sizing: border-box; }
        .cell-day { height: 40px; display: flex; align-items: center; justify-content: center; border-top: 1px solid ${t.border}; border-right: 1px solid ${t.border}; font-size: 11px; box-sizing: border-box; }
        .header-day { height: 55px !important; flex-direction: column; gap: 2px; background: ${t.bg} !important; }
      `}</style>

      <header className="no-print" style={{ background: t.card, padding: "10px 20px", display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.border}`, alignItems: 'center', position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: t.accent, fontSize: 16 }}>SALA DE CONTROL</span>
          <button onClick={() => { setManualTheme(true); setThemeMode(themeMode === 'dark' ? 'light' : 'dark'); }} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>{themeMode === 'dark' ? '🌙' : '☀️'}</button>
          <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 4, padding: '4px 8px', fontSize: 12 }}>
            {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 9, opacity: 0.7, textAlign: 'right' }}>{session.user}<br/>({session.role})</span>
          <button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '6px 10px', borderRadius: 4, fontSize: 10, fontWeight: 'bold', cursor: 'pointer' }}>SALIR</button>
        </div>
      </header>

      <nav className="no-print" style={{ display: 'flex', background: t.card, borderBottom: `1px solid ${t.border}`, position: 'sticky', top: 48, zIndex: 190, justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: 800 }}>
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
        padding: '15px 10px',
        color: view === v ? t.accent : t.sub,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 'bold',
        borderBottom: view === v ? `3px solid ${t.accent}` : 'none',
        fontSize: 11
      }}
    >
      {labels[v]}
    </button>
  );
})}
        </div>
      </nav>

      <main style={{ padding: "20px 10px", maxWidth: 1400, margin: '0 auto' }}>
        {view === "calendar" && (
          <div>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20, alignItems: 'center' }}>
              <button style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: 'pointer', fontSize: 12 }} onClick={handlePrevMonth}>Ant.</button>
              <h2 style={{ margin: 0, minWidth: 120, textAlign: 'center', fontSize: 16, color: t.title }}>{MONTHS[month]} {activeYear}</h2>
              <button style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: 'pointer', fontSize: 12 }} onClick={handleNextMonth}>Sig.</button>
            </div>

            <div className="calendar-container">
              <div className="calendar-grid">
                <div className="sticky-col" style={{ height: 55, borderBottom: `1px solid ${t.border}` }} />
                {Array.from({ length: dim(activeYear, month) }).map((_, i) => {
                  const rotHeader = cshift(activeYear, month, i+1, off);
                  return (
                    <div key={i} className="cell-day header-day">
                      <span style={{ color: dow(activeYear, month, i+1) >= 5 ? '#EF4444' : t.sub, fontSize: 9 }}>{DOW_S[dow(activeYear, month, i+1)]}</span>
                      <span style={{ fontWeight: 'bold', fontSize: 11 }}>{i+1}</span>
                      <span style={{ fontSize: 9, fontWeight: '800', color: TURNO_DEF[rotHeader]?.color }}>{rotHeader === 'D' ? '' : rotHeader}</span>
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
                      const dk = mk(activeYear, month+1, i+1), abs = op.calendar?.[dk], rot = cshift(activeYear, month, i+1, off), calcAsgn = asgn[dk]?.[op.id];
                      const finalCode = abs || calcAsgn || rot;
                      let cellBg = "transparent", cellColor = t.text;
                      if (abs) { cellBg = ABSENCE[abs].color; cellColor = "#000"; }
                      else if (calcAsgn === "SC") { cellBg = EXTRA_VISUALS.SC.bg; cellColor = EXTRA_VISUALS.SC.color; }
                      else if (TURNO_DEF[rot]) { cellBg = TURNO_DEF[rot].bg; cellColor = TURNO_DEF[rot].color; }
                      return (
                        <div key={i} className="cell-day" style={{ borderTop: `1px solid ${t.border}`, background: cellBg, color: cellColor, fontWeight: rot !== 'D' || abs || calcAsgn === 'SC' ? 'bold' : 'normal' }}>
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

        {view === "stats" && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {stats.sort((a,b) => b.nSC - a.nSC || b.hSC - a.hSC).map(s => (
              <div key={s.id} style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}><Av name={s.name} color={s.color} size={32} /><div style={{ fontWeight: 'bold', color: t.accent, fontSize: 18 }}>{s.name}</div></div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>{s.sc} SC</div>
                <div style={{ fontSize: 14, color: t.sub }}>{s.hSC} Horas / <strong style={{ color: t.accent }}>{s.nSC} Noches</strong></div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} canEdit={canEdit} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
            <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ color: t.accent }}>OPERADORES</h3>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input id="newOpN" placeholder="Nombre..." style={{ flex: 1, padding: 12, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
                <button onClick={() => { const n = document.getElementById('newOpN').value; if(n) { saveOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {} }]); document.getElementById('newOpN').value = ''; } }} style={{ padding: '0 20px', background: t.accent, borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>AÑADIR</button>
              </div>
              {ops.map(o => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${t.border}` }}><span>{o.name}</span><button onClick={() => saveOps(ops.filter(x => x.id !== o.id))} style={{ color: '#EF4444', border: 'none', background: 'none', cursor: 'pointer' }}>×</button></div>)}
            </div>

            <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ color: t.accent }}>🔄 OFFSET: {off}</h3>
              <input type="number" value={off} onChange={e => saveOff(Number(e.target.value))} style={{ padding: 12, width: '100%', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
            </div>

            {isSuper && (
              <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ color: t.accent }}>GESTIÓN DE ACCESOS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  <input id="newU" placeholder="Usuario" style={{ padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input id="newP" type={showConfigPass ? "text" : "password"} placeholder="Contraseña" style={{ flex: 1, padding: 10, paddingRight: 40, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
                    <button onClick={() => setShowConfigPass(!showConfigPass)} style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><EyeIcon visible={showConfigPass} color={t.sub} /></button>
                  </div>
                  <select id="newR" style={{ padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }}><option value="admin">Administrador</option><option value="editor">Editor</option></select>
                  <button onClick={() => {
                    const u = document.getElementById('newU').value, p = document.getElementById('newP').value, r = document.getElementById('newR').value;
                    if(u && p) { saveAdmins([...admins, { user: u, passHash: simpleHash(p), role: r }]); document.getElementById('newU').value = ''; document.getElementById('newP').value = ''; }
                  }} style={{ padding: 12, background: t.accent, borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>CREAR</button>
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
    <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
      {!canEdit && <p style={{ color: '#EF4444', fontSize: 12, marginBottom: 15, fontWeight: 'bold' }}>MODO LECTURA</p>}
      <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ padding: 12, width: '100%', background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 20 }}>
        {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.keys(ABSENCE).map(k => (
          <button key={k} onClick={() => setSelAb(k)} style={{ background: selAb === k ? ABSENCE[k].color : 'transparent', border: `2px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.bg, padding: 12, borderRadius: 10, border: `1px solid ${t.border}` }}>
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
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: t.card, padding: 40, borderRadius: 24, width: "100%", maxWidth: 380, border: `1px solid ${t.border}` }}>
        <h2 style={{ textAlign: 'center', color: t.accent, marginBottom: 30 }}>SALA DE CONTROL</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ padding: 14, borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input type={showPass ? "text" : "password"} value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" style={{ flex: 1, padding: 14, paddingRight: 45, borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
            <button onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}><EyeIcon visible={showPass} color={t.sub} /></button>
          </div>
          <button onClick={() => { const f = admins.find(a => a.user === user && a.passHash === simpleHash(pass)); if(f) onLogin(f); else alert("Acceso denegado"); }} style={{ padding: 16, background: t.accent, borderRadius: 12, border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>ENTRAR</button>
          <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ background: 'none', border: 'none', color: t.sub, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Modo lectura</button>
        </div>
      </div>
    </div>
  );
}
