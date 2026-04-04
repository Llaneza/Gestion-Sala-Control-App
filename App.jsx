import { useState, useMemo, useEffect } from "react";
// --- NUEVAS IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

// --- TU CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAAW-KbrhHIzDyRTgmVjlzPa7TK8o9FeI4",
  authDomain: "app-sala-control.firebaseapp.com",
  projectId: "app-sala-control",
  storageBucket: "app-sala-control.firebasestorage.app",
  messagingSenderId: "622611612673",
  appId: "1:622611612673:web:4200dcddc50292908c2c00"
};

// Inicializamos la conexión
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- CONFIGURACIÓN FIJA ---
function simpleHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16);
}

const DEFAULT_ADMINS = [
  { user: "admin", passHash: simpleHash("admin1234"), role: "superadmin" },
  { user: "editor1", passHash: simpleHash("editor1234"), role: "editor" }
];

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
};

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW_S = ["L", "M", "X", "J", "V", "S", "D"];
const TURNO_DEF = {
  M: { color: "#F59E0B", label: "Mañana", bg: "#F59E0B15" },
  N: { color: "#818CF8", label: "Noche", bg: "#818CF815" },
  D: { color: "#64748B", label: "Descanso", bg: "transparent" }
};

const EXTRA_VISUALS = {
  SC: { color: "#34D399", bg: "#34D39925" },
  CA: { color: "#475569", bg: "transparent" }
};

// --- UTILS ---
const dim = (y, m) => new Date(y, m + 1, 0).getDate();
const dow = (y, m, d) => { const r = new Date(y, m, d).getDay(); return r === 0 ? 6 : r - 1; };
const dse = (y, m, d) => Math.round((new Date(y, m, d) - new Date(1970, 0, 1)) / 86400000);
const mk = (y, m, d) => `${y}-${m}-${d}`;

function cshift(y, m, d, off = 0) {
  const pos = ((dse(y, m, d) + off) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  return CYCLE[Math.floor(pos / 7)][pos % 7];
}

// --- ALGORITMO ---
function autoAssign(ops, targetYear, off) {
  const hSC = {}, nSC = {}, pairs = {};
  ops.forEach(o => { hSC[o.id] = 0; nSC[o.id] = 0; pairs[o.id] = {}; ops.forEach(other => { if(o.id !== other.id) pairs[o.id][other.id] = 0; }); });
  const allAssigns = {};
  for (let year = 2021; year <= targetYear; year++) {
    allAssigns[year] = {};
    for (let mo = 0; mo < 12; mo++) {
      for (let d = 1; d <= dim(year, mo); d++) {
        const k = mk(year, mo + 1, d), turno = cshift(year, mo, d, off);
        allAssigns[year][k] = {};
        if (turno === "D") { ops.forEach(op => { allAssigns[year][k][op.id] = "D"; }); continue; }
        const avail = ops.filter(op => !op.calendar?.[k]), busy = ops.filter(op => op.calendar?.[k]);
        busy.forEach(op => { allAssigns[year][k][op.id] = op.calendar[k]; });
        let bestPair = [], minScore = Infinity;
        for (let i = 0; i < avail.length; i++) {
          for (let j = i + 1; j < avail.length; j++) {
            const p1 = avail[i], p2 = avail[j];
            let score = (hSC[p1.id] + hSC[p2.id]);
            if (turno === "N") score += (nSC[p1.id] + nSC[p2.id]) * 50;
            score += (pairs[p1.id][p2.id] || 0) * 100;
            if (score < minScore) { minScore = score; bestPair = [p1.id, p2.id]; }
          }
        }
        ops.forEach(op => {
          if (bestPair.includes(op.id)) { allAssigns[year][k][op.id] = "SC"; hSC[op.id] += 12; if (turno === "N") nSC[op.id] += 1; }
          else if (!allAssigns[year][k][op.id]) { allAssigns[year][k][op.id] = "CA"; }
        });
        if (bestPair.length === 2) { pairs[bestPair[0]][bestPair[1]]++; pairs[bestPair[1]][bestPair[0]]++; }
      }
    }
  }
  return allAssigns[targetYear] || {};
}

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

const Av = ({ name, color, size = 24 }) => (
  <div style={{ width: size, height: size, borderRadius: 8, background: color || '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: '#000', fontWeight: 'bold' }}>
    {name?.substring(0, 2).toUpperCase() || "??"}
  </div>
);

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const today = new Date();
  const [session, setSession] = useState(null);

  // --- ESTADOS SINCRONIZADOS CON FIREBASE ---
  const [admins, setAdmins] = useState(DEFAULT_ADMINS);
  const [ops, setOps] = useState([
    { id: 1, name: "Alejandro", color: "#F472B6", calendar: {} },
    { id: 2, name: "Claudia", color: "#60A5FA", calendar: {} },
    { id: 3, name: "Toni", color: "#34D399", calendar: {} },
    { id: 4, name: "Manuga", color: "#FBBF24", calendar: {} },
    { id: 5, name: "Rosa", color: "#A78BFA", calendar: {} },
    { id: 6, name: "Kao", color: "#FB7185", calendar: {} },
  ]);
  const [off, setOff] = useState(-11);

  const [view, setView] = useState("calendar");
  const [activeYear, setAY] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [themeMode, setThemeMode] = useState('dark');
  const [manualTheme, setManualTheme] = useState(false);

  // --- LÓGICA DE SINCRONIZACIÓN EN TIEMPO REAL ---
  useEffect(() => {
    onValue(ref(db, 'ops'), (snapshot) => {
      const data = snapshot.val();
      if (data) setOps(data);
    });
    onValue(ref(db, 'admins'), (snapshot) => {
      const data = snapshot.val();
      if (data) setAdmins(data);
    });
    onValue(ref(db, 'offset'), (snapshot) => {
      const data = snapshot.val();
      if (data !== null) setOff(data);
    });
  }, []);

  const saveOps = (newOps) => set(ref(db, 'ops'), newOps);
  const saveAdmins = (newAdmins) => set(ref(db, 'admins'), newAdmins);
  const saveOff = (newOff) => set(ref(db, 'offset'), newOff);

  useEffect(() => {
    if (!manualTheme) {
      const hour = new Date().getHours();
      setThemeMode(hour >= 8 && hour < 20 ? 'light' : 'dark');
    }
  }, [manualTheme]);

  const toggleTheme = () => { setManualTheme(true); setThemeMode(prev => prev === 'dark' ? 'light' : 'dark'); };
  const t = THEMES[themeMode];

  const isAdmin = session?.role === "admin" || session?.role === "superadmin";
  const canEdit = isAdmin || session?.role === "editor";
  // La pestaña EDITOR ahora es visible para todos
  const canViewEditor = true;

  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

  const handlePrevMonth = () => { if (month === 0) { setMonth(11); setAY(v => v - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 11) { setMonth(0); setAY(v => v + 1); } else setMonth(month + 1); };

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace', transition: 'background 0.3s' }}>
      <style>{`
        @media print { .no-print { display: none !important; } .print-break { page-break-after: always; } body { background: white !important; color: black !important; } }
        .calendar-container { background: ${t.card}; border-radius: 12px; padding: 0; overflow-x: auto; border: 1px solid ${t.border}; margin-bottom: 40px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); position: relative; }
        .calendar-grid { display: grid; grid-template-columns: 160px repeat(${dim(activeYear, month)}, 1fr); gap: 0px; min-width: max-content; }
        .sticky-col { position: sticky; left: 0; background: ${t.card} !important; z-index: 100; border-right: 2px solid ${t.border} !important; }
        .cell-day { height: 38px; display: flex; align-items: center; justify-content: center; border-top: 1px solid ${t.border}; border-right: 1px solid ${t.border}; }
        .header-day { height: 55px !important; flex-direction: column; gap: 2px; }
        @media (max-width: 768px) { .calendar-grid { grid-template-columns: 90px repeat(${dim(activeYear, month)}, 42px) !important; } .sticky-col { box-shadow: 4px 0 8px rgba(0,0,0,0.4); } .cell-day { height: 48px !important; font-size: 11px !important; } .nav-btn { padding: 12px 5px !important; font-size: 9px !important; flex: 1; } }
      `}</style>
      
      <header className="no-print" style={{ background: t.card, padding: "10px 20px", display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.border}`, alignItems: 'center', position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: t.accent, fontSize: 16 }}>SALA DE CONTROL ☁️</span>
          <button onClick={toggleTheme} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: 14 }}>{themeMode === 'dark' ? '🌙' : '☀️'}</button>
          <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>
            {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>SALIR</button>
      </header>

      <nav className="no-print" style={{ display: 'flex', background: t.card, borderBottom: `1px solid ${t.border}`, position: 'sticky', top: 48, zIndex: 190, justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: 800 }}>
          {["calendar", "stats", canViewEditor && "editor", isAdmin && "config"].filter(Boolean).map(v => (
            <button key={v} className="nav-btn" onClick={() => setView(v)} style={{ padding: '15px 20px', color: view === v ? t.accent : t.sub, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: view === v ? `3px solid ${t.accent}` : 'none', transition: '0.2s' }}>{v.toUpperCase()}</button>
          ))}
        </div>
      </nav>

      <main style={{ padding: "20px 10px", maxWidth: 1400, margin: '0 auto' }}>
        {view === "calendar" && (
          <div>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 25, alignItems: 'center' }}>
              <button style={{ padding: '10px 15px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: 'pointer', minWidth: '80px' }} onClick={handlePrevMonth}>Ant.</button>
              <h2 style={{ margin: 0, minWidth: 140, textAlign: 'center', fontSize: 18, color: t.title }}>{MONTHS[month]} {activeYear}</h2>
              <button style={{ padding: '10px 15px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: 'pointer', minWidth: '80px' }} onClick={handleNextMonth}>Sig.</button>
            </div>
            
            <h2 style={{ textAlign: 'center', color: t.title, fontSize: 20, marginBottom: 15 }}>{MONTHS[month].toUpperCase()} {activeYear}</h2>
            <div className="calendar-container">
              <div className="calendar-grid">
                <div className="sticky-col" style={{ height: 55, background: t.bg, borderBottom: `1px solid ${t.border}` }} />
                {Array.from({ length: dim(activeYear, month) }).map((_, i) => {
                  const rotHeader = cshift(activeYear, month, i+1, off);
                  return (
                    <div key={i} className="cell-day header-day" style={{ textAlign: 'center', background: t.bg }}>
                      <span style={{ color: dow(activeYear, month, i+1) >= 5 ? '#EF4444' : t.sub, fontSize: 9 }}>{DOW_S[dow(activeYear, month, i+1)]}</span>
                      <span style={{ fontWeight: 'bold', fontSize: 12 }}>{i+1}</span>
                      <span style={{ fontSize: 10, fontWeight: '800', color: TURNO_DEF[rotHeader]?.color }}>{rotHeader === 'D' ? '' : rotHeader}</span>
                    </div>
                  );
                })}
                {ops.map(op => (
                  <div key={op.id} style={{ display: 'contents' }}>
                    <div className="sticky-col" style={{ padding: '10px 12px', fontSize: 13, borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Av name={op.name} color={op.color} size={20} /> 
                      <span style={{ fontWeight: 'bold', color: t.text }}>{op.name}</span>
                    </div>
                    {Array.from({ length: dim(activeYear, month) }).map((_, i) => {
                      const dk = mk(activeYear, month+1, i+1), abs = op.calendar?.[dk], rot = cshift(activeYear, month, i+1, off);
                      const calcAsgn = asgn[dk]?.[op.id];
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
            {stats.map(s => (
              <div key={s.id} style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}><Av name={s.name} color={s.color} size={32} /><div style={{ fontWeight: 'bold', color: t.accent, fontSize: 18 }}>{s.name}</div></div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>{s.sc} SC</div>
                <div style={{ fontSize: 14, color: t.sub }}>{s.hSC} Horas / {s.nSC} Noches</div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} isReadOnly={!canEdit} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 30 }}>
            <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ marginTop: 0, color: t.accent }}>⚙️ OPERADORES</h3>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input id="newOpN" placeholder="Nombre..." style={{ flex: 1, padding: 12, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
                <button onClick={() => {
                  const n = document.getElementById('newOpN').value;
                  if(n) { saveOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {} }]); document.getElementById('newOpN').value = ''; }
                }} style={{ padding: '0 20px', background: t.accent, border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>AÑADIR</button>
              </div>
              {ops.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${t.border}` }}>
                  <span>{o.name}</span>
                  <button onClick={() => saveOps(ops.filter(x => x.id !== o.id))} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ marginTop: 0, color: t.accent }}>🔐 ACCESOS (ADMINS)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                <input id="adU" placeholder="Usuario" style={{ padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
                <input id="adP" type="password" placeholder="Pass" style={{ padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
                <button onClick={() => {
                  const u = document.getElementById('adU').value, p = document.getElementById('adP').value;
                  if(u && p) saveAdmins([...admins, { user: u, passHash: simpleHash(p), role: 'admin' }]);
                }} style={{ padding: 12, background: t.accent, border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>CREAR ADMIN</button>
              </div>
              {admins.map(a => (
                <div key={a.user} style={{ padding: '8px 0', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{a.user} <small>({a.role})</small></span>
                  {a.role !== 'superadmin' && <button onClick={() => saveAdmins(admins.filter(x => x.user !== a.user))} style={{ color: '#EF4444', border: 'none', background: 'none', cursor: 'pointer' }}>×</button>}
                </div>
              ))}
            </div>
            <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ marginTop: 0, color: t.accent }}>🔄 AJUSTE DE CICLO (OFFSET)</h3>
              <input type="number" value={off} onChange={e => saveOff(Number(e.target.value))} style={{ padding: 12, width: '100%', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
              <p style={{ fontSize: 11, color: t.sub, marginTop: 10 }}>Cambia este valor si el cuadrante no coincide con el día actual.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function EditorComponent({ ops, saveOps, activeYear, theme: t, off, isReadOnly }) {
  const [selOp, setSelOp] = useState(ops[0]?.id);
  const [selAb, setSelAb] = useState("VA");

  const toggleAbsence = (dateKey) => {
    if (isReadOnly) return; // Protección contra edición en modo lectura
    const newOps = ops.map(o => {
      if (o.id !== selOp) return o;
      const newCal = { ...(o.calendar || {}) };
      if (newCal[dateKey] === selAb) delete newCal[dateKey];
      else newCal[dateKey] = selAb;
      return { ...o, calendar: newCal };
    });
    saveOps(newOps);
  };

  return (
    <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 30, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <label style={{ fontSize: 12, color: t.sub }}>VISTA ANUAL DE OPERADOR {isReadOnly && "(MODO LECTURA)"}:</label>
          <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ padding: 12, width: '100%', background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 15 }}>
            {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: 10 }}>
              {Object.keys(ABSENCE).map(k => (
                <button key={k} onClick={() => setSelAb(k)} style={{ background: selAb === k ? ABSENCE[k].color : 'transparent', border: `2px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>
              ))}
            </div>
          )}
        </div>
        
        {/* LEYENDA SIEMPRE VISIBLE */}
        <div style={{ background: t.bg, padding: 15, borderRadius: 12, border: `1px solid ${t.border}`, minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 8, color: t.accent }}>LEYENDA DE TURNOS</div>
          {Object.entries(TURNO_DEF).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, background: v.color, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#000', fontWeight: 'bold' }}>{k}</div> {v.label}
            </div>
          ))}
          {Object.entries(ABSENCE).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
               <span style={{ fontSize: 12 }}>{v.icon}</span> {v.label}
            </div>
          ))}
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.bg, padding: 12, borderRadius: 10, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>{m.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const k = mk(activeYear, mi + 1, di + 1);
                const status = ops.find(o => o.id === selOp)?.calendar?.[k];
                const rot = cshift(activeYear, mi, di + 1, off);
                return (
                  <div key={di} 
                       onClick={() => toggleAbsence(k)} 
                       style={{ 
                         height: 32, 
                         background: status ? ABSENCE[status].color : t.card, 
                         borderBottom: `3px solid ${TURNO_DEF[rot]?.color || 'transparent'}`, 
                         display: 'flex', alignItems: 'center', justifyContent: 'center', 
                         fontSize: 10, 
                         cursor: isReadOnly ? 'default' : 'pointer', 
                         borderRadius: 4, 
                         color: status ? '#000' : t.text 
                       }}>
                    {di + 1}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginScreen({ admins, onLogin, theme: t }) {
  const [user, setUser] = useState(""), [pass, setPass] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: t.card, padding: 40, borderRadius: 24, width: "100%", maxWidth: 380, border: `1px solid ${t.border}` }}>
        <h2 style={{ textAlign: 'center', color: t.accent, marginBottom: 30 }}>SALA DE CONTROL</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ padding: 14, borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" style={{ padding: 14, borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
          <button onClick={() => {
            const f = admins.find(a => a.user === user && a.passHash === simpleHash(pass));
            if(f) onLogin(f); else alert("Acceso denegado");
          }} style={{ padding: 16, background: t.accent, borderRadius: 12, border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>ENTRAR</button>
          <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ background: 'none', border: 'none', color: t.sub, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Acceso modo lectura</button>
        </div>
      </div>
    </div>
  );
}
