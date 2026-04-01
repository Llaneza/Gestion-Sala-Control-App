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

// --- UTILS TEMPORALES ---
const dim = (y, m) => new Date(y, m + 1, 0).getDate();
const dow = (y, m, d) => { const r = new Date(y, m, d).getDay(); return r === 0 ? 6 : r - 1; };
const dse = (y, m, d) => Math.round((new Date(y, m, d) - new Date(1970, 0, 1)) / 86400000);
const mk = (y, m, d) => `${y}-${m}-${d}`;

function cshift(y, m, d, off = 0) {
  const pos = ((dse(y, m, d) + off) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  return CYCLE[Math.floor(pos / 7)][pos % 7];
}

// --- ALGORITMO DE EQUIDAD ---
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

// --- COMPONENTES UI ---
const Av = ({ name, color, size = 24 }) => (
  <div style={{ width: size, height: size, borderRadius: 8, background: color || '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: '#000', fontWeight: 'bold' }}>
    {name?.substring(0, 2).toUpperCase() || "??"}
  </div>
);

// --- PRINCIPAL ---
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

  const [themeMode, setThemeMode] = useState(() => {
    const hour = new Date().getHours();
    return (hour >= 8 && hour < 20) ? 'light' : 'dark';
  });
  const t = THEMES[themeMode];

  const isAdmin = session?.role === "admin" || session?.role === "superadmin";
  const canEdit = isAdmin || session?.role === "editor";

  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace', transition: 'background 0.3s' }}>
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>

      <header className="no-print" style={{ background: t.card, borderBottom: `1px solid ${t.border}`, padding: "10px 20px", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <span style={{ fontWeight: 800, color: t.accent }}>SALA DE CONTROL</span>
          <select value={activeYear} onChange={(e) => setAY(Number(e.target.value))} style={{ background: t.bg, color: t.accent, border: `1px solid ${t.accent}`, borderRadius: 4, padding: '2px 5px' }}>
            {Array.from({ length: 10 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <button onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>{themeMode === 'dark' ? '☀️' : '🌙'}</button>
          <span style={{ fontSize: 10, color: t.sub }}>{session.user} ({session.role})</span>
          <button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>Salir</button>
        </div>
      </header>

      <nav className="no-print" style={{ background: t.card, display: 'flex', borderBottom: `1px solid ${t.border}` }}>
        {["calendar", "stats", canEdit && "editor", isAdmin && "config"].filter(Boolean).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '12px 20px', background: 'none', border: 'none', color: view === v ? t.accent : t.sub, borderBottom: view === v ? `2px solid ${t.accent}` : 'none', cursor: 'pointer', fontWeight: 'bold' }}>{v.toUpperCase()}</button>
        ))}
      </nav>

      <main style={{ padding: 20 }}>
        {view === "calendar" && (
          <div>
            <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20, alignItems: 'center', position: 'relative' }}>
              <button onClick={() => month === 0 ? (setMonth(11), setAY(activeYear - 1)) : setMonth(month - 1)} style={{ background: t.card, color: t.text, border: `1px solid ${t.border}`, padding: '8px 15px', borderRadius: 6, cursor: 'pointer' }}>‹</button>
              <div style={{ width: 220, textAlign: 'center' }}>
                <h2 style={{ color: t.title, margin: 0, fontSize: 20 }}>{MONTHS[month]} {activeYear}</h2>
                {isAdmin && (
                  <div style={{ fontSize: 10, color: t.sub }}>
                    OFFSET: <input type="number" value={off} onChange={e => setOff(Number(e.target.value))} style={{ width: 40, background: 'transparent', border: 'none', color: t.accent, textAlign: 'center' }} />
                  </div>
                )}
              </div>
              <button onClick={() => month === 11 ? (setMonth(0), setAY(activeYear + 1)) : setMonth(month + 1)} style={{ background: t.card, color: t.text, border: `1px solid ${t.border}`, padding: '8px 15px', borderRadius: 6, cursor: 'pointer' }}>›</button>
              <button onClick={() => { setIsExporting(true); setTimeout(() => { window.print(); setIsExporting(false); }, 500); }} style={{ position: 'absolute', right: 0, background: '#6366F1', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>PDF ANUAL</button>
            </div>

            {(isExporting ? MONTHS : [MONTHS[month]]).map((mName, mIdx) => {
              const mi = isExporting ? mIdx : month;
              return (
                <div key={mName} style={{ marginBottom: isExporting ? 40 : 0, pageBreakAfter: 'always' }}>
                  <h3 style={{ color: t.accent, textAlign: 'center' }}>{mName.toUpperCase()} {activeYear}</h3>
                  <div style={{ overflowX: 'auto', background: t.card, borderRadius: 12, padding: 15, border: `1px solid ${t.border}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `150px repeat(${dim(activeYear, mi)}, 1fr)`, gap: 1 }}>
                      <div />
                      {Array.from({ length: dim(activeYear, mi) }).map((_, i) => (
                        <div key={i} style={{ textAlign: 'center', fontSize: 9 }}>
                          <div style={{ color: dow(activeYear, mi, i + 1) >= 5 ? '#EF4444' : t.sub }}>{DOW_S[dow(activeYear, mi, i + 1)]}</div>
                          <div style={{ fontWeight: 'bold', color: t.title }}>{i + 1}</div>
                          <div style={{ color: TURNO_DEF[cshift(activeYear, mi, i + 1, off)].color, fontSize: 8 }}>{cshift(activeYear, mi, i + 1, off)}</div>
                        </div>
                      ))}
                      {ops.map(op => (
                        <div key={op.id} style={{ display: 'contents' }}>
                          <div style={{ padding: '6px 0', borderTop: `1px solid ${t.border}`, fontSize: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Av name={op.name} color={op.color} size={18} />
                            <span style={{ color: t.text }}>{op.name}</span>
                          </div>
                          {Array.from({ length: dim(activeYear, mi) }).map((_, i) => {
                            const t_code = cshift(activeYear, mi, i + 1, off);
                            const a = asgn[mk(activeYear, mi + 1, i + 1)]?.[op.id];
                            const bg = t_code === 'D' ? (themeMode === 'dark' ? 'rgba(255,255,255,0.03)' : '#F8FAFC') : 'transparent';
                            return <div key={i} style={{ borderTop: `1px solid ${t.border}`, background: bg, textAlign: 'center', fontSize: 9, fontWeight: 'bold', lineHeight: '30px', color: a === 'SC' ? '#10B981' : (a === 'CA' ? '#3B82F6' : ABSENCE[a]?.color || t.sub) }}>{a === 'SC' ? 'SC' : (a || '·')}</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 15 }}>
            {stats.map(s => (
              <div key={s.id} style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
                <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 10, color: t.title }}>{s.name}</div>
                <div style={{ fontSize: 24, color: t.accent, fontWeight: 800 }}>{s.sc} SC</div>
                <div style={{ color: '#818CF8', fontSize: 12 }}>Noches SC: {s.nSC}</div>
                <div style={{ fontSize: 11, color: t.sub, marginTop: 5 }}>Total: {s.hSC} Horas Anuales</div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && canEdit && <EditorComponent ops={ops} setOps={setOps} activeYear={activeYear} off={off} theme={t} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <h3 style={{ marginTop: 0, color: t.title }}>Gestión Operadores</h3>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input id="newOpN" placeholder="Nombre" style={{ padding: 8, background: t.bg, border: `1px solid ${t.border}`, color: t.text, flex: 1, borderRadius: 4 }} />
                <button onClick={() => {
                  const n = document.getElementById('newOpN').value;
                  if (n) { setOps([...ops, { id: Date.now(), name: n, color: '#' + Math.random().toString(16).slice(2, 8), calendar: {} }]); document.getElementById('newOpN').value = ''; }
                }} style={{ background: t.accent, border: 'none', padding: '0 15px', borderRadius: 4, color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>Añadir</button>
              </div>
              {ops.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
                  <span>{o.name}</span>
                  <button onClick={() => setOps(ops.filter(x => x.id !== o.id))} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>Eliminar</button>
                </div>
              ))}
            </div>
            {session.role === "superadmin" && (
              <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
                <h3 style={{ marginTop: 0, color: t.title }}>Accesos Admin</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                  <input id="adU" placeholder="Usuario" style={{ padding: 8, background: t.bg, border: `1px solid ${t.border}`, color: t.text, width: '45%', borderRadius: 4 }} />
                  <input id="adP" type="password" placeholder="Pass" style={{ padding: 8, background: t.bg, border: `1px solid ${t.border}`, color: t.text, width: '45%', borderRadius: 4 }} />
                  <select id="adR" style={{ padding: 8, background: t.bg, color: t.text, border: `1px solid ${t.border}`, width: '45%', borderRadius: 4 }}>
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button onClick={() => {
                    const u = document.getElementById('adU').value, p = document.getElementById('adP').value, r = document.getElementById('adR').value;
                    if (u && p) { setAdmins([...admins, { user: u, passHash: simpleHash(p), role: r }]); document.getElementById('adU').value = ''; document.getElementById('adP').value = ''; }
                  }} style={{ background: t.accent, border: 'none', padding: '8px 15px', borderRadius: 4, width: '45%', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>Crear</button>
                </div>
                {admins.map(a => (
                  <div key={a.user} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${t.border}`, fontSize: 12 }}>
                    <span>{a.user} <small style={{ color: t.sub }}>({a.role})</small></span>
                    {a.role !== 'superadmin' && <button onClick={() => setAdmins(admins.filter(x => x.user !== a.user))} style={{ color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>}
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

function EditorComponent({ ops, setOps, activeYear, off, theme: t }) {
  const [selOp, setSelOp] = useState(ops[0]?.id);
  const [selAb, setSelAb] = useState("VA");
  return (
    <div style={{ background: t.card, padding: 25, borderRadius: 12, border: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 30, flexWrap: 'wrap', gap: 20 }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div><div style={{ fontSize: 11, color: t.sub, marginBottom: 5 }}>OPERADOR:</div>
            <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ padding: 10, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6 }}>
              {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div><div style={{ fontSize: 11, color: t.sub, marginBottom: 5 }}>AUSENCIA:</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.keys(ABSENCE).map(k => (
                <button key={k} onClick={() => setSelAb(k)} style={{ padding: '8px 15px', borderRadius: 6, border: `2px solid ${ABSENCE[k].color}`, background: selAb === k ? ABSENCE[k].color : 'transparent', color: selAb === k ? '#fff' : ABSENCE[k].color, fontWeight: 'bold', cursor: 'pointer' }}>{ABSENCE[k].icon} {k}</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ background: t.bg, padding: '10px 15px', borderRadius: 8, border: `1px solid ${t.border}`, minWidth: 160 }}>
          <div style={{ fontSize: 10, color: t.sub, fontWeight: 'bold', borderBottom: `1px solid ${t.border}`, marginBottom: 8 }}>LEYENDA TURNOS</div>
          {Object.entries(TURNO_DEF).map(([key, info]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 4 }}>
              <div style={{ width: 12, height: 4, background: info.color, borderRadius: 2 }} /><span style={{ color: t.text }}>{info.label} ({key})</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.bg, padding: 12, borderRadius: 8, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 10, color: t.accent }}>{m.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const k = mk(activeYear, mi + 1, di + 1), status = ops.find(o => o.id === selOp)?.calendar?.[k], turno = cshift(activeYear, mi, di + 1, off);
                return (
                  <div key={di} onClick={() => {
                    const newOps = ops.map(o => { if (o.id !== selOp) return o; const newCal = { ...o.calendar }; if (newCal[k] === selAb) delete newCal[k]; else newCal[k] = selAb; return { ...o, calendar: newCal }; });
                    setOps(newOps);
                  }} style={{ height: 32, background: status ? ABSENCE[status].color : t.card, color: status ? '#fff' : t.text, borderRadius: 4, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', borderBottom: `3px solid ${TURNO_DEF[turno].color}` }}>{di + 1}</div>
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
  const [user, setUser] = useState(""), [pass, setPass] = useState(""), [err, setErr] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: 'monospace' }}>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 16, padding: 30, width: 320 }}>
        <h2 style={{ textAlign: 'center', color: t.title, marginBottom: 20 }}>SALA DE CONTROL</h2>
        <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ width: "100%", padding: 12, marginBottom: 15, background: t.bg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 8, boxSizing: 'border-box' }} />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" style={{ width: "100%", padding: 12, marginBottom: 15, background: t.bg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 8, boxSizing: 'border-box' }} />
        {err && <div style={{ color: "#EF4444", fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button onClick={() => {
          const found = admins.find(a => a.user === user && a.passHash === simpleHash(pass));
          if (found) onLogin(found); else setErr("Acceso denegado");
        }} style={{ width: "100%", padding: 12, background: t.accent, color: '#000', border: "none", borderRadius: 8, fontWeight: "bold", cursor: "pointer" }}>Entrar</button>
        <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ width: "100%", marginTop: 15, background: "transparent", color: t.sub, border: "none", cursor: "pointer", textDecoration: "underline" }}>Acceso Invitado</button>
      </div>
    </div>
  );
}
