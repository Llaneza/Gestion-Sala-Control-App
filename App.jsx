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

// --- CONFIGURACIÓN ---
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

// --- LÓGICA DE ASIGNACIÓN ---
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

// --- COMPONENTES ---
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
  const [themeMode, setThemeMode] = useState('dark');
  const t = THEMES[themeMode];

  const isAdmin = session?.role === "admin" || session?.role === "superadmin";
  const canEdit = isAdmin || session?.role === "editor";
  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace' }}>
      <header style={{ background: t.card, padding: "10px 20px", display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.border}`, alignItems: 'center' }}>
        <span style={{ fontWeight: 800, color: t.accent, fontSize: 18 }}>SALA DE CONTROL</span>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: t.sub }}>{session.user} ({session.role})</span>
          <button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>Salir</button>
        </div>
      </header>

      <nav style={{ display: 'flex', background: t.card, borderBottom: `1px solid ${t.border}` }}>
        {["calendar", "stats", canEdit && "editor", isAdmin && "config"].filter(Boolean).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '15px 20px', background: 'none', border: 'none', color: view === v ? t.accent : t.sub, borderBottom: view === v ? `3px solid ${t.accent}` : 'none', cursor: 'pointer', fontWeight: 'bold' }}>
            {v === "calendar" ? "CALENDARIO" : v === "stats" ? "ESTADÍSTICAS" : v === "editor" ? "EDITOR" : "CONFIG"}
          </button>
        ))}
      </nav>

      <main style={{ padding: 20 }}>
        {view === "calendar" && (
           <div>
             <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 25, alignItems: 'center' }}>
               <button onClick={() => setMonth(month === 0 ? 11 : month - 1)} style={{ padding: '8px 15px', borderRadius: 6, background: t.card, color: t.text, border: `1px solid ${t.border}`, cursor: 'pointer' }}>‹ Ant</button>
               <h2 style={{ color: t.title, margin: 0, minWidth: 200, textAlign: 'center' }}>{MONTHS[month]} {activeYear}</h2>
               <button onClick={() => setMonth(month === 11 ? 0 : month + 1)} style={{ padding: '8px 15px', borderRadius: 6, background: t.card, color: t.text, border: `1px solid ${t.border}`, cursor: 'pointer' }}>Sig ›</button>
             </div>
             <div style={{ background: t.card, borderRadius: 12, padding: 15, border: `1px solid ${t.border}`, overflowX: 'auto' }}>
               <div style={{ display: 'grid', gridTemplateColumns: `150px repeat(${dim(activeYear, month)}, 1fr)`, gap: 1 }}>
                 <div />
                 {Array.from({ length: dim(activeYear, month) }).map((_, i) => (
                   <div key={i} style={{ textAlign: 'center', fontSize: 10, paddingBottom: 10 }}>
                     <div style={{ color: dow(activeYear, month, i+1) >= 5 ? '#EF4444' : t.sub }}>{DOW_S[dow(activeYear, month, i+1)]}</div>
                     <div style={{ fontWeight: 'bold', color: t.title }}>{i+1}</div>
                   </div>
                 ))}
                 {ops.map(op => (
                   <div key={op.id} style={{ display: 'contents' }}>
                     <div style={{ padding: '8px 0', borderTop: `1px solid ${t.border}`, fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                       <Av name={op.name} color={op.color} size={20} />
                       <span style={{ fontWeight: 'bold' }}>{op.name}</span>
                     </div>
                     {Array.from({ length: dim(activeYear, month) }).map((_, i) => {
                       const a = asgn[mk(activeYear, month+1, i+1)]?.[op.id];
                       const color = a === 'SC' ? '#10B981' : a === 'CA' ? '#3B82F6' : ABSENCE[a]?.color || t.sub;
                       return <div key={i} style={{ borderTop: `1px solid ${t.border}`, textAlign: 'center', fontSize: 11, lineHeight: '35px', fontWeight: 'bold', color }}>{a === 'SC' ? 'SC' : a || '·'}</div>
                     })}
                   </div>
                 ))}
               </div>
             </div>
           </div>
        )}

        {view === "stats" && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20 }}>
            {stats.map(s => (
              <div key={s.id} style={{ background: t.card, padding: 25, borderRadius: 12, border: `1px solid ${t.border}` }}>
                <div style={{ fontWeight: 'bold', color: t.title, fontSize: 18, marginBottom: 10 }}>{s.name}</div>
                <div style={{ fontSize: 32, color: t.accent, fontWeight: 900 }}>{s.sc} SC</div>
                <div style={{ fontSize: 14, color: t.sub, marginTop: 5 }}>Equivale a {s.hSC} horas anuales</div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} setOps={setOps} activeYear={activeYear} off={off} theme={t} />}
      </main>
    </div>
  );
}

function EditorComponent({ ops, setOps, activeYear, off, theme: t }) {
  const [selOp, setSelOp] = useState(ops[0]?.id);
  const [selAb, setSelAb] = useState("VA");
  return (
    <div style={{ background: t.card, padding: 25, borderRadius: 12, border: `1px solid ${t.border}` }}>
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: t.sub, display: 'block', marginBottom: 5 }}>SELECCIONAR OPERADOR:</label>
        <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ padding: 12, background: t.bg, color: t.text, borderRadius: 8, border: `1px solid ${t.border}`, width: '100%', maxWidth: 300 }}>
          {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 15, marginBottom: 30 }}>
        {Object.keys(ABSENCE).map(k => (
          <button key={k} onClick={() => setSelAb(k)} style={{ padding: '12px 20px', borderRadius: 8, border: `2px solid ${ABSENCE[k].color}`, background: selAb === k ? ABSENCE[k].color : 'transparent', color: selAb === k ? '#fff' : ABSENCE[k].color, fontWeight: 'bold', cursor: 'pointer' }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.bg, padding: 15, borderRadius: 10, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 10, color: t.accent, textAlign: 'center' }}>{m.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const k = mk(activeYear, mi + 1, di + 1), status = ops.find(o => o.id === selOp)?.calendar?.[k];
                return (
                  <div key={di} onClick={() => {
                    const newOps = ops.map(o => { if (o.id !== selOp) return o; const newCal = { ...o.calendar }; if (newCal[k] === selAb) delete newCal[k]; else newCal[k] = selAb; return { ...o, calendar: newCal }; });
                    setOps(newOps);
                  }} style={{ height: 35, background: status ? ABSENCE[status].color : t.card, color: status ? '#fff' : t.text, borderRadius: 6, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1px solid ${t.border}` }}>{di+1}</div>
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
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: 'monospace' }}>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: 20, padding: 40, width: "100%", maxWidth: 350, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
        <h2 style={{ textAlign: 'center', color: t.title, fontSize: 24, marginBottom: 30, letterSpacing: 2 }}>SALA DE CONTROL</h2>
        <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ width: "100%", padding: 15, marginBottom: 15, background: t.bg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 10, boxSizing: 'border-box' }} />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" style={{ width: "100%", padding: 15, marginBottom: 25, background: t.bg, border: `1px solid ${t.border}`, color: t.text, borderRadius: 10, boxSizing: 'border-box' }} />
        <button onClick={() => {
          const found = admins.find(a => a.user === user && a.passHash === simpleHash(pass));
          if (found) onLogin(found); else alert("Acceso denegado");
        }} style={{ width: "100%", padding: 15, background: t.accent, color: '#000', border: "none", borderRadius: 10, fontWeight: "bold", cursor: "pointer", fontSize: 16 }}>Entrar</button>
        <div style={{ textAlign: 'center', marginTop: 25 }}>
          <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ background: "transparent", color: t.sub, border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>Acceso Invitado (Solo Lectura)</button>
        </div>
      </div>
    </div>
  );
}
