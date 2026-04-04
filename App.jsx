import { useState, useMemo, useEffect } from "react";
// --- INFRAESTRUCTURA FIREBASE ---
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

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

// --- LÓGICA CORE Y UTILIDADES ---
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

const EXTRA_VISUALS = { SC: { color: "#34D399", bg: "#34D39925" }, CA: { color: "#475569", bg: "transparent" } };

const dim = (y, m) => new Date(y, m + 1, 0).getDate();
const dow = (y, m, d) => { const r = new Date(y, m, d).getDay(); return r === 0 ? 6 : r - 1; };
const dse = (y, m, d) => Math.round((new Date(y, m, d) - new Date(1970, 0, 1)) / 86400000);
const mk = (y, m, d) => `${y}-${m}-${d}`;

function cshift(y, m, d, off = 0) {
  const pos = ((dse(y, m, d) + off) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  return CYCLE[Math.floor(pos / 7)][pos % 7];
}

// --- ALGORITMO DE ASIGNACIÓN SC/CA ---
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

// --- COMPONENTE DE CUADRANTE ---
function CalendarGrid({ ops, year, month, off, asgn, t }) {
  const dCount = dim(year, month);
  return (
    <div className="calendar-container" style={{ background: t.card, borderRadius: 12, overflowX: "auto", border: `1px solid ${t.border}`, position: 'relative', marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `160px repeat(${dCount}, 1fr)`, minWidth: 'max-content' }}>
        <div style={{ height: 55, background: t.bg, borderBottom: `1px solid ${t.border}` }} className="sticky-col" />
        {Array.from({ length: dCount }).map((_, i) => {
          const rot = cshift(year, month, i+1, off);
          return (
            <div key={i} style={{ textAlign: 'center', padding: '5px', borderBottom: `1px solid ${t.border}`, background: t.bg, display: 'flex', flexDirection: 'column', height: 55, justifyContent: 'center' }}>
              <span style={{ color: dow(year, month, i+1) >= 5 ? '#EF4444' : t.sub, fontSize: 9 }}>{DOW_S[dow(year, month, i+1)]}</span>
              <span style={{ fontWeight: 'bold', fontSize: 12 }}>{i+1}</span>
              <span style={{ color: TURNO_DEF[rot]?.color, fontWeight: '800', fontSize: 10 }}>{rot === 'D' ? '' : rot}</span>
            </div>
          );
        })}
        {ops.map(op => (
          <div key={op.id} style={{ display: 'contents' }}>
            <div className="sticky-col" style={{ padding: '10px 12px', fontSize: 13, borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 8, background: t.card }}>
              <Av name={op.name} color={op.color} size={20} /> <span style={{fontWeight:'bold'}}>{op.name}</span>
            </div>
            {Array.from({ length: dCount }).map((_, i) => {
              const dk = mk(year, month+1, i+1), abs = op.calendar?.[dk], rot = cshift(year, month, i+1, off), calc = asgn[dk]?.[op.id];
              const code = abs || calc || rot;
              let bg = "transparent", col = t.text;
              if (abs) { bg = ABSENCE[abs].color; col = "#000"; }
              else if (calc === "SC") { bg = EXTRA_VISUALS.SC.bg; col = EXTRA_VISUALS.SC.color; }
              else if (TURNO_DEF[rot]) { bg = TURNO_DEF[rot].bg; col = TURNO_DEF[rot].color; }
              return (
                <div key={i} style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: `1px solid ${t.border}`, background: bg, color: col, fontSize: 10, fontWeight: 'bold', borderRight: `1px solid ${t.border}` }}>
                  {code}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
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

  useEffect(() => {
    onValue(ref(db, 'ops'), s => s.val() && setOps(s.val()));
    onValue(ref(db, 'admins'), s => s.val() && setAdmins(s.val()));
    onValue(ref(db, 'offset'), s => s.val() !== null && setOff(s.val()));
  }, []);

  const saveOps = (n) => set(ref(db, 'ops'), n);
  const saveAdmins = (n) => set(ref(db, 'admins'), n);
  const saveOff = (n) => set(ref(db, 'offset'), n);

  const t = THEMES[themeMode];
  const isAdmin = session?.role === "admin" || session?.role === "superadmin";
  const canEdit = isAdmin || session?.role === "editor";
  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace' }}>
      <style>{`
        @media screen { .print-only { display: none !important; } }
        @media print { 
          .no-print { display: none !important; } 
          .print-only { display: block !important; background: white; }
          body { background: white !important; color: black !important; }
          .print-month { page-break-after: always; padding: 20px; }
          .sticky-col { position: relative !important; border-right: 1px solid #ccc !important; }
        }
        .sticky-col { position: sticky; left: 0; z-index: 20; border-right: 2px solid ${t.border}; }
      `}</style>
      
      {/* VISTA PARA PDF ANUAL */}
      <div className="print-only">
        <h1 style={{textAlign:'center'}}>CUADRANTE ANUAL {activeYear}</h1>
        {MONTHS.map((m, mi) => (
          <div key={mi} className="print-month">
            <h2 style={{ textAlign: 'center', marginBottom: 10 }}>{m.toUpperCase()}</h2>
            <CalendarGrid ops={ops} year={activeYear} month={mi} off={off} asgn={asgn} t={THEMES.light} />
          </div>
        ))}
      </div>

      <header className="no-print" style={{ background: t.card, padding: "12px 20px", display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.border}`, alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <span style={{ fontWeight: 900, color: t.accent, fontSize: 18 }}>SALA CONTROL ☁️</span>
          <button onClick={() => setThemeMode(m => m === 'dark' ? 'light' : 'dark')} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>{themeMode === 'dark' ? '🌙' : '☀️'}</button>
          <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, padding: '5px' }}>
            {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => window.print()} style={{ background: t.accent, color: '#000', border: 'none', padding: '8px 15px', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}>📄 EXPORTAR PDF ANUAL</button>
        </div>
        <button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '8px 15px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>SALIR</button>
      </header>

      <nav className="no-print" style={{ display: 'flex', background: t.card, borderBottom: `1px solid ${t.border}`, justifyContent: 'center', gap: 10 }}>
        {["calendar", "stats", "editor", isAdmin && "config"].filter(Boolean).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '15px 25px', color: view === v ? t.accent : t.sub, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: view === v ? `3px solid ${t.accent}` : 'none' }}>{v.toUpperCase()}</button>
        ))}
      </nav>

      <main className="no-print" style={{ padding: "30px 20px", maxWidth: 1400, margin: '0 auto' }}>
        {view === "calendar" && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 15, marginBottom: 30, alignItems: 'center' }}>
              <button style={{padding:'10px 20px', borderRadius:8}} onClick={() => setMonth(m => m === 0 ? 11 : m - 1)}>← ANTERIOR</button>
              <h2 style={{ margin: 0, minWidth: 200, textAlign: 'center', fontSize: 24 }}>{MONTHS[month].toUpperCase()} {activeYear}</h2>
              <button style={{padding:'10px 20px', borderRadius:8}} onClick={() => setMonth(m => m === 11 ? 0 : m + 1)}>SIGUIENTE →</button>
            </div>
            <CalendarGrid ops={ops} year={activeYear} month={month} off={off} asgn={asgn} t={t} />
          </div>
        )}

        {view === "stats" && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {stats.map(s => (
              <div key={s.id} style={{ background: t.card, padding: 30, borderRadius: 20, border: `1px solid ${t.border}`, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <Av name={s.name} color={s.color} size={40} />
                  <div style={{ fontWeight: 'bold', fontSize: 20, color: t.accent }}>{s.name}</div>
                </div>
                <div style={{ fontSize: 36, fontWeight: 900, marginBottom: 5 }}>{s.sc} SC</div>
                <div style={{ color: t.sub }}>{s.hSC} Horas Totales</div>
                <div style={{ color: t.sub }}>{s.nSC} Turnos de Noche</div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} isReadOnly={!canEdit} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 30 }}>
            <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ color: t.accent }}>⚙️ GESTIÓN DE EQUIPO</h3>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input id="newOpN" placeholder="Nombre..." style={{ flex: 1, padding: 12, borderRadius: 8, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
                <button onClick={() => { const n = document.getElementById('newOpN').value; if(n) { saveOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {} }]); document.getElementById('newOpN').value=''; } }} style={{ background: t.accent, border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 'bold' }}>AÑADIR</button>
              </div>
              {ops.map(o => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${t.border}` }}><span>{o.name}</span><button onClick={() => saveOps(ops.filter(x=>x.id!==o.id))} style={{color:'#EF4444', border:'none', background:'none', cursor:'pointer'}}>Eliminar</button></div>)}
            </div>
            <div style={{ background: t.card, padding: 25, borderRadius: 16, border: `1px solid ${t.border}` }}>
              <h3 style={{ color: t.accent }}>🔄 AJUSTE DE CICLO (OFFSET)</h3>
              <input type="number" value={off} onChange={e => saveOff(Number(e.target.value))} style={{ width: '100%', padding: 15, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, fontSize: 18 }} />
              <p style={{fontSize:12, color:t.sub, marginTop:15}}>Ajusta este valor si el ciclo rotativo (M-M-D-D-N-N-N) no coincide con el día real.</p>
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
  const toggleAbsence = (k) => {
    if (isReadOnly) return;
    const n = ops.map(o => {
      if (o.id !== selOp) return o;
      const c = { ...(o.calendar || {}) };
      c[k] === selAb ? delete c[k] : c[k] = selAb;
      return { ...o, calendar: c };
    });
    saveOps(n);
  };

  return (
    <div style={{ background: t.card, padding: 30, borderRadius: 20, border: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 30, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <label style={{ fontSize: 12, color: t.sub }}>OPERADOR EN EDICIÓN {isReadOnly && "(MODO LECTURA)"}</label>
          <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ display: 'block', width: 300, padding: 12, background: t.bg, color: t.text, borderRadius: 8, marginTop: 5 }}>
            {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {!isReadOnly && (
            <div style={{ marginTop: 15, display: 'flex', gap: 10 }}>
              {Object.keys(ABSENCE).map(k => (
                <button key={k} onClick={() => setSelAb(k)} style={{ background: selAb === k ? ABSENCE[k].color : 'transparent', border: `2px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, padding: '10px 15px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: t.bg, padding: 20, borderRadius: 12, border: `1px solid ${t.border}`, minWidth: 220 }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 10, color: t.accent }}>LEYENDA DE TURNOS</div>
          {Object.entries(TURNO_DEF).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 5 }}>
              <div style={{ width: 12, height: 12, background: v.color, borderRadius: 3 }}></div> {v.label}
            </div>
          ))}
          {Object.entries(ABSENCE).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, marginBottom: 5 }}>
               <span>{v.icon}</span> {v.label}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={mi} style={{ background: t.bg, padding: 15, borderRadius: 12, border: `1px solid ${t.border}` }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: 10 }}>{m.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const k = mk(activeYear, mi+1, di+1), rot = cshift(activeYear, mi, di+1, off), abs = ops.find(o=>o.id===selOp)?.calendar?.[k];
                return (
                  <div key={di} onClick={() => toggleAbsence(k)} style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: abs ? ABSENCE[abs].color : t.card, borderBottom: `3px solid ${TURNO_DEF[rot]?.color}`, fontSize: 10, cursor: isReadOnly ? 'default' : 'pointer', color: abs ? '#000' : t.text, borderRadius: 4 }}>{di+1}</div>
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
    <div style={{ height: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: t.card, padding: 50, borderRadius: 30, border: `1px solid ${t.border}`, width: '100%', maxWidth: 400, textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
        <h1 style={{ color: t.accent, marginBottom: 10, fontSize: 28 }}>SALA CONTROL</h1>
        <p style={{ color: t.sub, marginBottom: 30 }}>Introduce tus credenciales de acceso</p>
        <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ display: 'block', width: '100%', padding: 15, margin: '10px 0', borderRadius: 12, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" style={{ display: 'block', width: '100%', padding: 15, margin: '10px 0', borderRadius: 12, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <button onClick={() => {
          const f = admins.find(a => a.user === user && a.passHash === simpleHash(pass));
          if(f) onLogin(f); else alert("Usuario o contraseña incorrectos");
        }} style={{ background: t.accent, color: '#000', padding: 15, width: '100%', border: 'none', borderRadius: 12, fontWeight: 'bold', fontSize: 16, cursor: 'pointer', marginTop: 10 }}>INICIAR SESIÓN</button>
        <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ marginTop: 20, background: 'none', border: 'none', color: t.sub, cursor: 'pointer', textDecoration: 'underline' }}>Continuar como Invitado (Lectura)</button>
      </div>
    </div>
  );
}
