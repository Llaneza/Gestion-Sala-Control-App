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
  light: { bg: "#F1F5F9", card: "#FFFFFF", text: "#334155", title: "#0F172A", border: "#E2E8F0", sub: "#94A3B8", accent: "#059669" }
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
  const currentYear = new Date().getFullYear();
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
  const [month, setMonth] = useState(new Date().getMonth());
  const [isExporting, setIsExporting] = useState(false);
  const [themeMode, setThemeMode] = useState('dark');
  const t = THEMES[themeMode];

  const isAdmin = session?.role === "admin" || session?.role === "superadmin";
  const canEdit = isAdmin || session?.role === "editor";
  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace' }}>
      <style>{`
        @media print { .no-print { display: none !important; } .print-break { page-break-after: always; } body { background: white !important; color: black !important; } }
        @media (max-width: 768px) {
          .calendar-grid { grid-template-columns: 100px repeat(${dim(activeYear, month)}, 40px) !important; }
          .sticky-col { position: sticky; left: 0; background: ${t.card}; z-index: 5; border-right: 1px solid ${t.border}; }
        }
      `}</style>
      
      <header className="no-print" style={{ background: t.card, padding: "10px 20px", display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.border}`, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: t.accent }}>SALA DE CONTROL</span>
          <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.bg, color: t.accent, border: `1px solid ${t.accent}`, borderRadius: 4 }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '5px 10px', borderRadius: 4, fontSize: 10 }}>SALIR</button>
      </header>

      <nav className="no-print" style={{ display: 'flex', background: t.card, borderBottom: `1px solid ${t.border}`, overflowX: 'auto' }}>
        {["calendar", "stats", canEdit && "editor", isAdmin && "config"].filter(Boolean).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: 15, color: view === v ? t.accent : t.sub, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>{v.toUpperCase()}</button>
        ))}
      </nav>

      <main style={{ padding: 20 }}>
        {view === "calendar" && (
          <div>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setMonth(month === 0 ? 11 : month - 1)}>‹</button>
              {/* CORRECCIÓN AQUÍ: Se añade el activeYear al lado del mes */}
              <h2 style={{ margin: 0, width: 220, textAlign: 'center' }}>{MONTHS[month]} {activeYear}</h2>
              <button onClick={() => setMonth(month === 11 ? 0 : month + 1)}>›</button>
              <button 
                onClick={() => { setIsExporting(true); setTimeout(() => { window.print(); setIsExporting(false); }, 500); }} 
                style={{ marginLeft: 20, background: '#6366F1', color: '#fff', border: 'none', padding: '8px 15px', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>
                PDF ANUAL
              </button>
            </div>
            
            {(isExporting ? MONTHS : [MONTHS[month]]).map((mName, mIdx) => {
              const mi = isExporting ? mIdx : month;
              return (
                <div key={mName} className={isExporting ? "print-break" : ""}>
                   <h2 style={{ textAlign: 'center', color: isExporting ? '#000' : t.title }}>{mName.toUpperCase()} {activeYear}</h2>
                   <div style={{ background: t.card, borderRadius: 12, padding: 10, overflowX: 'auto', border: `1px solid ${t.border}`, marginBottom: 20 }}>
                    <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: `150px repeat(${dim(activeYear, mi)}, 1fr)`, gap: 1 }}>
                      <div className="sticky-col" />
                      {Array.from({ length: dim(activeYear, mi) }).map((_, i) => (
                        <div key={i} style={{ textAlign: 'center', fontSize: 10 }}>
                          <div style={{ color: dow(activeYear, mi, i+1) >= 5 ? '#EF4444' : t.sub }}>{DOW_S[dow(activeYear, mi, i+1)]}</div>
                          <div style={{ fontWeight: 'bold' }}>{i+1}</div>
                        </div>
                      ))}
                      {ops.map(op => (
                        <div key={op.id} style={{ display: 'contents' }}>
                          <div className="sticky-col" style={{ padding: '8px 5px', fontSize: 11, borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Av name={op.name} color={op.color} size={18} /> {op.name}
                          </div>
                          {Array.from({ length: dim(activeYear, mi) }).map((_, i) => {
                            const a = asgn[mk(activeYear, mi+1, i+1)]?.[op.id];
                            return <div key={i} style={{ textAlign: 'center', fontSize: 10, borderTop: `1px solid ${t.border}`, lineHeight: '35px' }}>{a || '·'}</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15 }}>
            {stats.map(s => (
              <div key={s.id} style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
                <div style={{ fontWeight: 'bold', color: t.accent }}>{s.name}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{s.sc} SC</div>
                <div style={{ fontSize: 12, color: t.sub }}>{s.hSC} Horas / {s.nSC} Noches</div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} setOps={setOps} activeYear={activeYear} theme={t} off={off} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <h3>Gestión Operadores</h3>
              <div style={{ display: 'flex', gap: 5, marginBottom: 15 }}>
                <input id="newOpN" placeholder="Nombre" style={{ flex: 1, padding: 8 }} />
                <button onClick={() => {
                  const n = document.getElementById('newOpN').value;
                  if(n) setOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {} }]);
                }}>Añadir</button>
              </div>
              {ops.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
                  <span>{o.name}</span>
                  <button onClick={() => setOps(ops.filter(x => x.id !== o.id))} style={{ color: '#EF4444', background: 'none', border: 'none' }}>×</button>
                </div>
              ))}
            </div>
            
            <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <h3>Accesos (Admin/Editor)</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 15 }}>
                <input id="adU" placeholder="Usuario" style={{ width: '45%' }} />
                <input id="adP" type="password" placeholder="Pass" style={{ width: '45%' }} />
                <select id="adR" style={{ width: '45%' }}>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                </select>
                <button onClick={() => {
                  const u = document.getElementById('adU').value, p = document.getElementById('adP').value, r = document.getElementById('adR').value;
                  if(u && p) setAdmins([...admins, { user: u, passHash: simpleHash(p), role: r }]);
                }} style={{ width: '100%', marginTop: 5 }}>Añadir Acceso</button>
              </div>
              {admins.map(a => (
                <div key={a.user} style={{ fontSize: 12, padding: '5px 0', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{a.user} ({a.role})</span>
                  {a.role !== 'superadmin' && <button onClick={() => setAdmins(admins.filter(x => x.user !== a.user))} style={{ background: 'none', border: 'none', color: '#EF4444' }}>×</button>}
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
    <div style={{ background: t.card, padding: 20, borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, marginBottom: 20 }}>
        <div>
          <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ padding: 10, borderRadius: 8 }}>
            {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
            {Object.keys(ABSENCE).map(k => (
              <button key={k} onClick={() => setSelAb(k)} style={{ background: selAb === k ? ABSENCE[k].color : 'transparent', border: `2px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, padding: '5px 10px', borderRadius: 6, fontWeight: 'bold' }}>{ABSENCE[k].icon} {k}</button>
            ))}
          </div>
        </div>
        <div style={{ background: t.bg, padding: 10, borderRadius: 8, fontSize: 11 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 5 }}>LEYENDA TURNOS</div>
          {Object.entries(TURNO_DEF).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 10, background: v.color }} /> {v.label} ({k})
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.bg, padding: 10, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 5 }}>{m.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const k = mk(activeYear, mi + 1, di + 1), status = ops.find(o => o.id === selOp)?.calendar?.[k], tCode = cshift(activeYear, mi, di + 1, off);
                return (
                  <div key={di} onClick={() => {
                    const newOps = ops.map(o => { if (o.id !== selOp) return o; const newCal = { ...o.calendar }; if (newCal[k] === selAb) delete newCal[k]; else newCal[k] = selAb; return { ...o, calendar: newCal }; });
                    setOps(newOps);
                  }} style={{ height: 30, background: status ? ABSENCE[status].color : t.card, borderBottom: `3px solid ${TURNO_DEF[tCode].color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, cursor: 'pointer', borderRadius: 4 }}>{di + 1}</div>
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
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: t.card, padding: 30, borderRadius: 16, width: 300, border: `1px solid ${t.border}` }}>
        <h2 style={{ textAlign: 'center', color: t.accent }}>SALA DE CONTROL</h2>
        <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ width: '100%', padding: 10, marginBottom: 10 }} />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Pass" style={{ width: '100%', padding: 10, marginBottom: 20 }} />
        <button onClick={() => {
          const f = admins.find(a => a.user === user && a.passHash === simpleHash(pass));
          if(f) onLogin(f); else alert("Error");
        }} style={{ width: '100%', padding: 10, background: t.accent, border: 'none', fontWeight: 'bold' }}>ENTRAR</button>
        <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: t.sub, textDecoration: 'underline' }}>Acceso Invitado</button>
      </div>
    </div>
  );
}
