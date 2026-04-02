import { useState, useMemo, useEffect } from "react";

// --- PERSISTENCIA & TEMAS ---
function usePersisted(key, def) {
  const [s, set] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch { return def; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(s)); } catch {}
  }, [key, s]);
  return [s, set];
}

const THEMES = {
  dark: { bg: "#080F1E", card: "#0D1526", text: "#CBD5E1", title: "#FFFFFF", border: "#1E2D45", sub: "#475569", accent: "#34D399" },
  light: { bg: "#F1F5F9", card: "#FFFFFF", text: "#334155", title: "#0F172A", border: "#CBD5E1", sub: "#64748B", accent: "#059669" }
};

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
  M: { color: "#F59E0B", label: "Mañana" },
  N: { color: "#818CF8", label: "Noche" },
  D: { color: "#64748B", label: "Descanso" }
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

export default function App() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const [session, setSession] = useState(null);
  const [admins, setAdmins] = usePersisted("sc_admins_v4", DEFAULT_ADMINS);
  const [ops, setOps] = usePersisted("sc_ops_v4", [
    { id: 1, name: "Alejandro", color: "#F472B6", calendar: {} },
    { id: 2, name: "Claudia", color: "#60A5FA", calendar: {} },
    { id: 3, name: "Toni", color: "#34D399", calendar: {} },
    { id: 4, name: "Manuga", color: "#FBBF24", calendar: {} },
    { id: 5, name: "Rosa", color: "#A78BFA", calendar: {} },
    { id: 6, name: "Kao", color: "#FB7185", calendar: {} },
  ]);
  const [off, setOff] = usePersisted("sc_cycle_offset_v4", -11);
  const [view, setView] = useState("calendar");
  const [activeYear, setAY] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [isExporting, setIsExporting] = useState(false);

  // --- TEMAS ---
  const [themeMode, setThemeMode] = useState('dark');
  const [manualTheme, setManualTheme] = useState(false);

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
  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

  const handlePrevMonth = () => { if (month === 0) { setMonth(11); setAY(v => v - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 11) { setMonth(0); setAY(v => v + 1); } else setMonth(month + 1); };

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace', transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @media print { .no-print { display: none !important; } .print-break { page-break-after: always; } body { background: white !important; color: black !important; } }
        .calendar-container { background: ${t.card}; border-radius: 12px; padding: 0; overflow-x: auto; border: 1px solid ${t.border}; margin-bottom: 40px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); position: relative; }
        .calendar-grid { display: grid; grid-template-columns: 160px repeat(${dim(activeYear, month)}, 1fr); gap: 0px; min-width: max-content; }
        .sticky-col { position: sticky; left: 0; background: ${t.card} !important; z-index: 100; border-right: 2px solid ${t.border} !important; }
        .cell-day { height: 38px; display: flex; align-items: center; justify-content: center; border-top: 1px solid ${t.border}; border-right: 1px solid ${t.border}; }
        @media (max-width: 768px) { .calendar-grid { grid-template-columns: 90px repeat(${dim(activeYear, month)}, 42px) !important; } .sticky-col { box-shadow: 4px 0 8px rgba(0,0,0,0.4); } .cell-day { height: 48px !important; font-size: 11px !important; } .nav-btn { padding: 12px 5px !important; font-size: 9px !important; flex: 1; } }
      `}</style>
      
      <header className="no-print" style={{ background: t.card, padding: "10px 20px", display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.border}`, alignItems: 'center', position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: t.accent, fontSize: 16 }}>SALA DE CONTROL</span>
          <button onClick={toggleTheme} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', fontSize: 14 }}>{themeMode === 'dark' ? '🌙' : '☀️'}</button>
          <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 4, padding: '4px 8px', cursor: 'pointer' }}>
            {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 'bold', cursor: 'pointer' }}>SALIR</button>
      </header>

      <nav className="no-print" style={{ display: 'flex', background: t.card, borderBottom: `1px solid ${t.border}`, position: 'sticky', top: 48, zIndex: 190, justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: 800 }}>
          {["calendar", "stats", canEdit && "editor", isAdmin && "config"].filter(Boolean).map(v => (
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
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <button className="no-print" onClick={() => { setIsExporting(true); setTimeout(() => { window.print(); setIsExporting(false); }, 500); }} style={{ background: '#6366F1', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>🖨️ GENERAR PDF ANUAL</button>
            </div>
            {(isExporting ? MONTHS : [MONTHS[month]]).map((mName, mIdx) => {
              const mi = isExporting ? mIdx : month;
              return (
                <div key={mName} className={isExporting ? "print-break" : ""}>
                   <h2 style={{ textAlign: 'center', color: isExporting ? '#000' : t.title, fontSize: 20, marginBottom: 15 }}>{mName.toUpperCase()} {activeYear}</h2>
                   <div className="calendar-container">
                    <div className="calendar-grid">
                      <div className="sticky-col" style={{ height: 40, background: t.bg, borderBottom: `1px solid ${t.border}` }} />
                      {Array.from({ length: dim(activeYear, mi) }).map((_, i) => (
                        <div key={i} className="cell-day" style={{ textAlign: 'center', fontSize: 11, background: t.bg }}>
                          <div><div style={{ color: dow(activeYear, mi, i+1) >= 5 ? '#EF4444' : t.sub, fontSize: 9 }}>{DOW_S[dow(activeYear, mi, i+1)]}</div><div style={{ fontWeight: 'bold' }}>{i+1}</div></div>
                        </div>
                      ))}
                      {ops.map(op => (
                        <div key={op.id} style={{ display: 'contents' }}>
                          <div className="sticky-col" style={{ padding: '10px 12px', fontSize: 13, borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Av name={op.name} color={op.color} size={20} /> 
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 'bold', color: t.text }}>{op.name}</span>
                          </div>
                          {Array.from({ length: dim(activeYear, mi) }).map((_, i) => {
                            const dateKey = mk(activeYear, mi+1, i+1), absenceCode = op.calendar?.[dateKey], rotationCode = cshift(activeYear, mi, i+1, off);
                            return (
                              <div key={i} className="cell-day" style={{ textAlign: 'center', fontSize: 12, borderTop: `1px solid ${t.border}`, color: absenceCode ? '#000' : (rotationCode === 'D' ? t.sub : t.text), background: absenceCode ? ABSENCE[absenceCode].color : 'transparent', fontWeight: rotationCode !== 'D' ? 'bold' : 'normal' }}>
                                {absenceCode || rotationCode}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "stats" && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {stats.map(s => (
              <div key={s.id} style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}><Av name={s.name} color={s.color} size={32} /><div style={{ fontWeight: 'bold', color: t.accent, fontSize: 18 }}>{s.name}</div></div>
                <div style={{ fontSize: 32, fontWeight: 800, marginBottom: 5 }}>{s.sc} SC</div>
                <div style={{ fontSize: 14, color: t.sub }}>{s.hSC} Horas Totales</div>
                <div style={{ fontSize: 14, color: t.sub }}>{s.nSC} Turnos de Noche</div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} setOps={setOps} activeYear={activeYear} theme={t} off={off} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 30 }}>
            <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ marginTop: 0, color: t.accent }}>⚙️ GESTIÓN DE OPERADORES</h3>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input id="newOpN" placeholder="Nuevo nombre..." style={{ flex: 1, padding: 12, borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
                <button style={{ padding: '0 20px', background: t.accent, border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }} onClick={() => {
                  const n = document.getElementById('newOpN').value;
                  if(n) { setOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {} }]); document.getElementById('newOpN').value = ''; }
                }}>AÑADIR</button>
              </div>
              {ops.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: `1px solid ${t.border}`, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 12, height: 12, borderRadius: '50%', background: o.color }} /><span style={{ fontSize: 15 }}>{o.name}</span></div>
                  <button onClick={() => setOps(ops.filter(x => x.id !== o.id))} style={{ color: '#EF4444', background: '#EF444411', border: 'none', width: 30, height: 30, borderRadius: 6, cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function EditorComponent({ ops, setOps, activeYear, theme: t, off }) {
  const [selOp, setSelOp] = useState(ops[0]?.id);
  const [selAb, setSelAb] = useState("VA");
  return (
    <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20, marginBottom: 30 }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <label style={{ fontSize: 12, color: t.sub, marginBottom: 5, display: 'block' }}>1. SELECCIONA OPERADOR:</label>
          <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ padding: 12, borderRadius: 8, width: '100%', fontSize: 16, background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
            {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <label style={{ fontSize: 12, color: t.sub, marginBottom: 5, mt: 15, display: 'block', marginTop: 15 }}>2. SELECCIONA TIPO DE AUSENCIA:</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.keys(ABSENCE).map(k => (
              <button key={k} onClick={() => setSelAb(k)} style={{ background: selAb === k ? ABSENCE[k].color : 'transparent', border: `2px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, padding: '10px 20px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.bg, padding: 15, borderRadius: 12, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 12, textAlign: 'center', color: t.accent }}>{m.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const k = mk(activeYear, mi + 1, di + 1), status = ops.find(o => o.id === selOp)?.calendar?.[k], tCode = cshift(activeYear, mi, di + 1, off);
                return (
                  <div key={di} onClick={() => {
                    const newOps = ops.map(o => { if (o.id !== selOp) return o; const newCal = { ...o.calendar }; if (newCal[k] === selAb) delete newCal[k]; else newCal[k] = selAb; return { ...o, calendar: newCal }; });
                    setOps(newOps);
                  }} style={{ height: 38, background: status ? ABSENCE[status].color : t.card, borderBottom: `4px solid ${TURNO_DEF[tCode].color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer', borderRadius: 6, fontWeight: 'bold', color: status ? '#000' : t.text }}>{di + 1}</div>
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
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🛡️</div>
          <h2 style={{ margin: 0, color: t.accent, letterSpacing: 2 }}>SALA DE CONTROL</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ width: '100%', padding: 14, borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" style={{ width: '100%', padding: 14, borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text }} />
          <button onClick={() => {
            const f = admins.find(a => a.user === user && a.passHash === simpleHash(pass));
            if(f) onLogin(f); else alert("Acceso denegado");
          }} style={{ width: '100%', padding: 16, background: t.accent, border: 'none', fontWeight: 'bold', borderRadius: 12, color: '#000', cursor: 'pointer' }}>ENTRAR</button>
          <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: t.sub, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Acceso modo lectura</button>
        </div>
      </div>
    </div>
  );
}
