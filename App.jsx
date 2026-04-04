import { useState, useMemo, useEffect } from "react";
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
  <div style={{ width: size, height: size, borderRadius: 6, background: color || '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, color: '#000', fontWeight: 'bold' }}>
    {name?.substring(0, 2).toUpperCase() || "??"}
  </div>
);

function CalendarGrid({ ops, year, month, off, asgn, t }) {
  const dCount = dim(year, month);
  return (
    <div className="calendar-container" style={{ background: t.card, borderRadius: 12, overflowX: "auto", border: `1px solid ${t.border}`, position: 'relative', marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(${dCount}, 45px)`, minWidth: 'max-content' }}>
        <div style={{ height: 50, background: t.bg, borderBottom: `1px solid ${t.border}`, position: 'sticky', left: 0, zIndex: 30 }} />
        {Array.from({ length: dCount }).map((_, i) => {
          const rot = cshift(year, month, i+1, off);
          return (
            <div key={i} style={{ textAlign: 'center', borderBottom: `1px solid ${t.border}`, background: t.bg, display: 'flex', flexDirection: 'column', height: 50, justifyContent: 'center' }}>
              <span style={{ color: dow(year, month, i+1) >= 5 ? '#EF4444' : t.sub, fontSize: 10 }}>{DOW_S[dow(year, month, i+1)]}</span>
              <span style={{ fontWeight: 'bold', fontSize: 13 }}>{i+1}</span>
            </div>
          );
        })}
        {ops.map(op => (
          <div key={op.id} style={{ display: 'contents' }}>
            <div style={{ padding: '8px', fontSize: 12, borderTop: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 5, background: t.card, position: 'sticky', left: 0, zIndex: 20, borderRight: `2px solid ${t.border}` }}>
              <Av name={op.name} color={op.color} size={18} /> <span style={{fontWeight:'bold', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{op.name}</span>
            </div>
            {Array.from({ length: dCount }).map((_, i) => {
              const dk = mk(year, month+1, i+1), abs = op.calendar?.[dk], rot = cshift(year, month, i+1, off), calc = asgn[dk]?.[op.id];
              const code = abs || calc || rot;
              let bg = "transparent", col = t.text;
              if (abs) { bg = ABSENCE[abs].color; col = "#000"; }
              else if (calc === "SC") { bg = EXTRA_VISUALS.SC.bg; col = EXTRA_VISUALS.SC.color; }
              else if (TURNO_DEF[rot]) { bg = TURNO_DEF[rot].bg; col = TURNO_DEF[rot].color; }
              return (
                <div key={i} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: `1px solid ${t.border}`, background: bg, color: col, fontSize: 11, fontWeight: 'bold', borderRight: `1px solid ${t.border}33` }}>
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

export default function App() {
  const today = new Date();
  const [session, setSession] = useState(null);
  const [admins, setAdmins] = useState(DEFAULT_ADMINS);
  const [ops, setOps] = useState([]);
  const [off, setOff] = useState(-11);
  const [view, setView] = useState("calendar");
  const [activeYear, setAY] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  
  // --- LÓGICA TEMA AUTOMÁTICO ---
  const getSystemTheme = () => (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const [themeMode, setThemeMode] = useState(getSystemTheme());

  useEffect(() => {
    // Sincronizar el color de fondo del body con el tema seleccionado
    document.body.style.backgroundColor = THEMES[themeMode].bg;
  }, [themeMode]);

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
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'sans-serif' }}>
      <style>{`
        @media screen and (max-width: 600px) {
          .header-controls { flex-direction: column; gap: 10px; width: 100%; }
          .nav-menu { overflow-x: auto; justify-content: flex-start !important; padding: 0 10px; }
          .stats-grid { grid-template-columns: 1fr !important; }
          .editor-grid { grid-template-columns: 1fr !important; }
          .login-box { padding: 30px 20px !important; }
        }
        @media print { 
          .no-print { display: none !important; } 
          .print-only { display: block !important; background: white; color: black; }
          .print-month { page-break-after: always; padding: 20px; }
        }
        .print-only { display: none; }
      `}</style>
      
      <div className="print-only">
        <h1 style={{textAlign:'center'}}>CUADRANTE ANUAL {activeYear}</h1>
        {MONTHS.map((m, mi) => (
          <div key={mi} className="print-month">
            <h2 style={{ textAlign: 'center' }}>{m.toUpperCase()}</h2>
            <CalendarGrid ops={ops} year={activeYear} month={mi} off={off} asgn={asgn} t={THEMES.light} />
          </div>
        ))}
      </div>

      <header className="no-print" style={{ background: t.card, padding: "15px", borderBottom: `1px solid ${t.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        <div className="header-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 900, color: t.accent, fontSize: 16 }}>SALA CONTROL</span>
            <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, padding: '4px' }}>
              {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => window.print()} style={{ background: t.accent, color: '#000', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 'bold', fontSize: 12 }}>PDF</button>
          </div>
          <div style={{display:'flex', gap:10}}>
            <button onClick={() => setThemeMode(m => m === 'dark' ? 'light' : 'dark')} style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 6, padding: '5px' }}>{themeMode === 'dark' ? '🌙' : '☀️'}</button>
            <button onClick={() => setSession(null)} style={{ background: '#EF444422', color: '#EF4444', border: 'none', padding: '6px 12px', borderRadius: 6, fontWeight: 'bold', fontSize: 12 }}>SALIR</button>
          </div>
        </div>
      </header>

      <nav className="no-print nav-menu" style={{ display: 'flex', background: t.card, borderBottom: `1px solid ${t.border}`, justifyContent: 'center', whiteSpace: 'nowrap' }}>
        {["calendar", "stats", "editor", isAdmin && "config"].filter(Boolean).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '15px 20px', color: view === v ? t.accent : t.sub, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: view === v ? `3px solid ${t.accent}` : 'none', fontSize: 12 }}>{v.toUpperCase()}</button>
        ))}
      </nav>

      <main className="no-print" style={{ padding: "15px", maxWidth: 1400, margin: '0 auto' }}>
        {view === "calendar" && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20, alignItems: 'center' }}>
              <button style={{padding:'8px 12px'}} onClick={() => setMonth(m => m === 0 ? 11 : m - 1)}>←</button>
              <h2 style={{ margin: 0, fontSize: 18 }}>{MONTHS[month].toUpperCase()}</h2>
              <button style={{padding:'8px 12px'}} onClick={() => setMonth(m => m === 11 ? 0 : m + 1)}>→</button>
            </div>
            <CalendarGrid ops={ops} year={activeYear} month={month} off={off} asgn={asgn} t={t} />
          </div>
        )}

        {view === "stats" && (
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 15 }}>
            {stats.map(s => (
              <div key={s.id} style={{ background: t.card, padding: 20, borderRadius: 15, border: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Av name={s.name} color={s.color} size={30} />
                  <div style={{ fontWeight: 'bold', fontSize: 16, color: t.accent }}>{s.name}</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{s.sc} SC</div>
                <div style={{ color: t.sub, fontSize: 12 }}>{s.hSC}h Totales | {s.nSC} Noches</div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} isReadOnly={!canEdit} />}

        {view === "config" && isAdmin && (
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <h3>EQUIPO</h3>
              <div style={{ display: 'flex', gap: 5, marginBottom: 15 }}>
                <input id="newOpN" placeholder="Nombre..." style={{ flex: 1, padding: 10, borderRadius: 6, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
                <button onClick={() => { const n = document.getElementById('newOpN').value; if(n) saveOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {} }]); }} style={{ background: t.accent, border: 'none', padding: '10px', borderRadius: 6 }}>+</button>
              </div>
              {ops.map(o => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${t.border}` }}><span>{o.name}</span><button onClick={() => saveOps(ops.filter(x=>x.id!==o.id))} style={{color:'#EF4444', border:'none', background:'none'}}>Eliminar</button></div>)}
            </div>
            <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <h3>ACCESOS</h3>
              <input id="adU" placeholder="User" style={{ width: '100%', padding: 10, marginBottom: 5, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
              <input id="adP" type="password" placeholder="Pass" style={{ width: '100%', padding: 10, marginBottom: 5, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
              <button onClick={() => {
                const u = document.getElementById('adU').value, p = document.getElementById('adP').value;
                if(u && p) saveAdmins([...admins, { user: u, passHash: simpleHash(p), role: "editor" }]);
              }} style={{ width: '100%', background: t.accent, padding: 10, border: 'none', borderRadius: 6, fontWeight: 'bold' }}>CREAR EDITOR</button>
              <div style={{marginTop:10}}>
                {admins.map(a => <div key={a.user} style={{fontSize:12, padding:'4px 0'}}>{a.user} ({a.role})</div>)}
              </div>
            </div>
            <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <h3>OFFSET: {off}</h3>
              <input type="range" min="-28" max="28" value={off} onChange={e => saveOff(Number(e.target.value))} style={{width:'100%'}} />
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
    <div style={{ background: t.card, padding: "15px", borderRadius: 15, border: `1px solid ${t.border}` }}>
      <div style={{ marginBottom: 20 }}>
        <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ width: '100%', padding: 12, background: t.bg, color: t.text, borderRadius: 8, fontSize: 14 }}>
          {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {!isReadOnly && (
          <div style={{ marginTop: 10, display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 5 }}>
            {Object.keys(ABSENCE).map(k => (
              <button key={k} onClick={() => setSelAb(k)} style={{ background: selAb === k ? ABSENCE[k].color : 'transparent', border: `2px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap', fontSize: 12 }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>
            ))}
          </div>
        )}
      </div>
      <div className="editor-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={mi} style={{ background: t.bg, padding: 10, borderRadius: 10 }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 12, marginBottom: 8 }}>{m.toUpperCase()}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const k = mk(activeYear, mi+1, di+1), rot = cshift(activeYear, mi, di+1, off), abs = ops.find(o=>o.id===selOp)?.calendar?.[k];
                return (
                  <div key={di} onClick={() => toggleAbsence(k)} style={{ height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', background: abs ? ABSENCE[abs].color : t.card, borderBottom: `3px solid ${TURNO_DEF[rot]?.color}`, fontSize: 11, color: abs ? '#000' : t.text, borderRadius: 4 }}>{di+1}</div>
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
      <div className="login-box" style={{ background: t.card, padding: 40, borderRadius: 25, border: `1px solid ${t.border}`, width: '100%', maxWidth: 350, textAlign: 'center' }}>
        <h2 style={{ color: t.accent, marginBottom: 20 }}>SALA CONTROL</h2>
        <input value={user} onChange={e => setUser(e.target.value)} placeholder="Usuario" style={{ width: '100%', padding: 15, marginBottom: 10, borderRadius: 10, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Contraseña" style={{ width: '100%', padding: 15, marginBottom: 15, borderRadius: 10, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
        <button onClick={() => {
          const f = admins.find(a => a.user === user && a.passHash === simpleHash(pass));
          if(f) onLogin(f); else alert("Error");
        }} style={{ width: '100%', background: t.accent, padding: 15, border: 'none', borderRadius: 10, fontWeight: 'bold' }}>ENTRAR</button>
        <button onClick={() => onLogin({ role: "guest", user: "Invitado" })} style={{ marginTop: 20, background: 'none', border: 'none', color: t.sub, fontSize: 13 }}>Modo Invitado</button>
      </div>
    </div>
  );
}
