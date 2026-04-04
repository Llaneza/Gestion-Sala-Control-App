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

// --- UTILS SEGURIDAD ---
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
const ABSENCE = { VA: { label: "Vacaciones", icon: "🌴", color: "#10B981" }, EN: { label: "Entrenamiento", icon: "📖", color: "#A78BFA" } };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DOW_S = ["L", "M", "X", "J", "V", "S", "D"];
const TURNO_DEF = {
  M: { color: "#F59E0B", label: "Mañana", bg: "#F59E0B15" },
  N: { color: "#818CF8", label: "Noche", bg: "#818CF815" },
  D: { color: "#64748B", label: "Descanso", bg: "transparent" }
};
const EXTRA_VISUALS = { SC: { color: "#34D399", bg: "#34D39925" }, CA: { color: "#475569", bg: "transparent" } };

// --- COMPONENTES UI ---
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

// --- UTILS LÓGICOS ---
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
  let currentBlockPair = [];
  let daysInCurrentBlock = 0;
  const allAssigns = {};
  for (let year = 2024; year <= targetYear; year++) {
    allAssigns[year] = {};
    for (let mo = 0; mo < 12; mo++) {
      for (let d = 1; d <= dim(year, mo); d++) {
        const k = mk(year, mo + 1, d), turno = cshift(year, mo, d, off);
        allAssigns[year][k] = {};
        if (turno === "D") { ops.forEach(op => { allAssigns[year][k][op.id] = "D"; }); continue; }
        if (daysInCurrentBlock >= 4 || currentBlockPair.length === 0) {
          const avail = ops.filter(op => !op.calendar?.[k]);
          let bestPair = [], minScore = Infinity;
          for (let i = 0; i < avail.length; i++) {
            for (let j = i + 1; j < avail.length; j++) {
              const p1 = avail[i], p2 = avail[j];
              let score = (hSC[p1.id] + hSC[p2.id]);
              if (turno === "N") score += (nSC[p1.id] + nSC[p2.id]) * 150;
              score += (pairs[p1.id][p2.id] || 0) * 80;
              if (score < minScore) { minScore = score; bestPair = [p1.id, p2.id]; }
            }
          }
          currentBlockPair = bestPair;
          daysInCurrentBlock = 0;
        }
        const busy = ops.filter(op => op.calendar?.[k]);
        busy.forEach(op => { allAssigns[year][k][op.id] = op.calendar[k]; });
        ops.forEach(op => {
          if (currentBlockPair.includes(op.id) && !allAssigns[year][k][op.id]) {
            allAssigns[year][k][op.id] = "SC";
            hSC[op.id] += 12;
            if (turno === "N") nSC[op.id] += 1;
          } else if (!allAssigns[year][k][op.id]) {
            allAssigns[year][k][op.id] = "CA";
          }
        });
        if (currentBlockPair.length === 2) {
          pairs[currentBlockPair[0]][currentBlockPair[1]]++;
          pairs[currentBlockPair[1]][currentBlockPair[0]]++;
        }
        daysInCurrentBlock++;
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

// --- APP COMPONENT ---
export default function App() {
  const today = new Date();
  const [session, setSession] = useState(null);
  const [ops, setOps] = useState([]);
  const [admins, setAdmins] = useState(DEFAULT_ADMINS);
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

  const t = THEMES[themeMode];
  const isSuper = session?.role === "superadmin";
  const isAdmin = session?.role === "admin" || isSuper;
  const canEdit = isAdmin || session?.role === "editor";
  const canSeeEditor = canEdit || session?.role === "guest";

  const asgn = useMemo(() => autoAssign(ops, activeYear, off), [ops, activeYear, off]);
  const stats = useMemo(() => computeStats(ops, activeYear, asgn, off), [ops, activeYear, asgn, off]);

  const exportYearPDF = async () => {
    const html2pdf = (await import('html2pdf.js')).default;
    const element = document.getElementById('full-year-export');
    element.style.display = 'block';
    const opt = {
      margin: 5,
      filename: `Cuadrante_${activeYear}.pdf`,
      html2canvas: { scale: 2, useCORS: true, backgroundColor: t.bg },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: 'avoid-all', before: '.page-break' }
    };
    await html2pdf().set(opt).from(element).save();
    element.style.display = 'none';
  };

  const CalendarTable = ({ mIdx, y, showHeader = true, isExport = false }) => (
    <div style={{ marginBottom: isExport ? 10 : 40, background: t.card, borderRadius: 12, border: `1px solid ${t.border}`, overflowX: 'auto' }}>
      {showHeader && <h3 style={{ padding: '10px 20px', margin: 0, color: t.accent }}>{MONTHS[mIdx]} {y}</h3>}
      <div style={{ display: 'grid', gridTemplateColumns: `140px repeat(${dim(y, mIdx)}, 1fr)`, minWidth: isExport ? '100%' : 'max-content' }}>
        <div style={{ height: 45, borderBottom: `1px solid ${t.border}`, background: t.card }} className="sticky-col" />
        {Array.from({ length: dim(y, mIdx) }).map((_, i) => {
          const rotHeader = cshift(y, mIdx, i+1, off);
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${t.border}`, background: t.bg, borderRight: `1px solid ${t.border}` }}>
              <span style={{ fontSize: 9, color: dow(y, mIdx, i+1) >= 5 ? '#EF4444' : t.sub }}>{DOW_S[dow(y, mIdx, i+1)]}</span>
              <span style={{ fontWeight: 'bold', fontSize: 11 }}>{i+1}</span>
              <span style={{ fontSize: 9, color: TURNO_DEF[rotHeader]?.color }}>{rotHeader === 'D' ? '' : rotHeader}</span>
            </div>
          );
        })}
        {ops.map(op => (
          <div key={op.id} style={{ display: 'contents' }}>
            <div style={{ padding: '8px 12px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 'bold', background: t.card }} className="sticky-col">
              <Av name={op.name} color={op.color} size={18} /> {op.name}
            </div>
            {Array.from({ length: dim(y, mIdx) }).map((_, i) => {
              const dk = mk(y, mIdx+1, i+1), abs = op.calendar?.[dk], rot = cshift(y, mIdx, i+1, off), calcAsgn = asgn[dk]?.[op.id];
              const finalCode = abs || calcAsgn || rot;
              let cellBg = "transparent", cellColor = t.text;
              if (abs) { cellBg = ABSENCE[abs].color; cellColor = "#000"; }
              else if (calcAsgn === "SC") { cellBg = EXTRA_VISUALS.SC.bg; cellColor = EXTRA_VISUALS.SC.color; }
              else if (TURNO_DEF[rot]) { cellBg = TURNO_DEF[rot].bg; cellColor = TURNO_DEF[rot].color; }
              return <div key={i} style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${t.border}`, borderRight: `1px solid ${t.border}`, background: cellBg, color: cellColor, fontSize: 10, fontWeight: rot !== 'D' ? 'bold' : 'normal' }}>{finalCode}</div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );

  if (!session) return <LoginScreen admins={admins} onLogin={setSession} theme={t} />;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: 'monospace' }}>
      <style>{`.sticky-col { position: sticky; left: 0; z-index: 5; border-right: 2px solid ${t.border} !important; }`}</style>
      
      <header style={{ background: t.card, padding: "10px 20px", display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${t.border}`, alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: t.accent }}>SALA DE CONTROL ☁️</span>
          <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 4, padding: '4px' }}>
            {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={exportYearPDF} style={{ background: t.accent, color: '#000', border: 'none', padding: '8px 12px', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer', fontSize: 11 }}>📥 PDF ANUAL</button>
      </header>

      <nav style={{ display: 'flex', background: t.card, borderBottom: `1px solid ${t.border}`, justifyContent: 'center' }}>
        {["calendar", "stats", canSeeEditor && "editor", isAdmin && "config"].filter(Boolean).map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding: '15px 20px', color: view === v ? t.accent : t.sub, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', borderBottom: view === v ? `3px solid ${t.accent}` : 'none' }}>{v.toUpperCase()}</button>
        ))}
      </nav>

      <main style={{ padding: "20px" }}>
        {view === "calendar" && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 20, alignItems: 'center' }}>
              <button onClick={() => setMonth(m => m === 0 ? 11 : m - 1)} style={{ padding: '5px 15px' }}>←</button>
              <h2 style={{ margin: 0, minWidth: 150, textAlign: 'center' }}>{MONTHS[month]}</h2>
              <button onClick={() => setMonth(m => m === 11 ? 0 : m + 1)} style={{ padding: '5px 15px' }}>→</button>
            </div>
            <CalendarTable mIdx={month} y={activeYear} showHeader={false} />
          </>
        )}

        {view === "stats" && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
            {stats.map(s => (
              <div key={s.id} style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Av name={s.name} color={s.color} /><span style={{ fontWeight: 'bold' }}>{s.name}</span></div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{s.sc} SC</div>
                <div style={{ fontSize: 12, color: t.sub }}>{s.hSC}h Totales | {s.nSC} Noches</div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} canEdit={canEdit} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <h3 style={{ color: t.accent }}>OPERADORES</h3>
              <div style={{ display: 'flex', gap: 5, marginBottom: 15 }}>
                <input id="nOp" placeholder="Nombre" style={{ flex: 1, padding: 8, background: t.bg, color: t.text, border: `1px solid ${t.border}` }} />
                <button onClick={() => { const n = document.getElementById('nOp').value; if(n) { saveOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {} }]); document.getElementById('nOp').value=''; } }} style={{ background: t.accent, border: 'none', padding: '0 10px', fontWeight: 'bold' }}>+</button>
              </div>
              {ops.map(o => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span>{o.name}</span><button onClick={() => saveOps(ops.filter(x => x.id !== o.id))} style={{ color: '#EF4444', border: 'none', background: 'none' }}>×</button></div>)}
            </div>
            <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
              <h3 style={{ color: t.accent }}>OFFSET: {off}</h3>
              <input type="number" value={off} onChange={e => saveOff(Number(e.target.value))} style={{ padding: 8, width: '100%', background: t.bg, color: t.text }} />
            </div>
          </div>
        )}

        <div id="full-year-export" style={{ display: 'none', padding: '10px' }}>
          <h1 style={{ textAlign: 'center', color: t.accent }}>CUADRANTE ANUAL {activeYear}</h1>
          {MONTHS.map((_, i) => <div key={i} className="page-break"><CalendarTable mIdx={i} y={activeYear} isExport={true} /></div>)}
        </div>
      </main>
    </div>
  );
}

function EditorComponent({ ops, saveOps, activeYear, theme: t, off, canEdit }) {
  const [selOp, setSelOp] = useState(ops[0]?.id);
  const [selAb, setSelAb] = useState("VA");
  const toggleAbsence = (dk) => {
    if (!canEdit) return;
    const newOps = ops.map(o => {
      if (o.id !== selOp) return o;
      const cal = { ...(o.calendar || {}) };
      cal[dk] === selAb ? delete cal[dk] : cal[dk] = selAb;
      return { ...o, calendar: cal };
    });
    saveOps(newOps);
  };
  return (
    <div style={{ background: t.card, padding: 20, borderRadius: 12, border: `1px solid ${t.border}` }}>
      <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ width: '100%', padding: 10, marginBottom: 15, background: t.bg, color: t.text }}>
        {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {Object.keys(ABSENCE).map(k => <button key={k} onClick={() => setSelAb(k)} style={{ flex: 1, padding: 10, background: selAb === k ? ABSENCE[k].color : 'none', border: `1px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, fontWeight: 'bold', borderRadius: 6 }}>{ABSENCE[k].label}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.bg, padding: 10, borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 }}>{m}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                const dk = mk(activeYear, mi+1, di+1), st = ops.find(o => o.id === selOp)?.calendar?.[dk], rot = cshift(activeYear, mi, di+1, off);
                return <div key={di} onClick={() => toggleAbsence(dk)} style={{ height: 25, fontSize: 9, background: st ? ABSENCE[st].color : t.card, borderBottom: `2px solid ${TURNO_DEF[rot]?.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: st ? '#000' : t.text }}>{di+1}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginScreen({ admins, onLogin, theme: t }) {
  const [u, setU] = useState(""), [p, setP] = useState(""), [show, setShow] = useState(false);
  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: t.card, padding: 30, borderRadius: 20, width: 320, border: `1px solid ${t.border}` }}>
        <h2 style={{ textAlign: 'center', color: t.accent }}>LOGIN</h2>
        <input value={u} onChange={e => setU(e.target.value)} placeholder="Usuario" style={{ width: '100%', padding: 12, marginBottom: 10, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8 }} />
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input type={show ? "text" : "password"} value={p} onChange={e => setP(e.target.value)} placeholder="Password" style={{ width: '100%', padding: 12, background: t.bg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8 }} />
          <button onClick={() => setShow(!show)} style={{ position: 'absolute', right: 10, top: 12, background: 'none', border: 'none', cursor: 'pointer' }}><EyeIcon visible={show} color={t.sub} /></button>
        </div>
        <button onClick={() => { const f = admins.find(a => a.user === u && a.passHash === simpleHash(p)); if(f) onLogin(f); else alert("Error"); }} style={{ width: '100%', padding: 12, background: t.accent, border: 'none', fontWeight: 'bold', borderRadius: 8 }}>ENTRAR</button>
        <button onClick={() => onLogin({ role: 'guest', user: 'Invitado' })} style={{ width: '100%', background: 'none', border: 'none', color: t.sub, marginTop: 10, cursor: 'pointer' }}>Modo lectura</button>
      </div>
    </div>
  );
}
