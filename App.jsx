import { useState, useMemo, useEffect } from "react";
import { ref, onValue, set } from "firebase/database";
import cortevaLogo from "./Corteva_VerColor_RGB.png";
import { autoAssign, generateSecurityPlan } from "./src/logic";
import { db } from "./src/services/firebase";
import { ABSENCE, CALENDAR_LEGEND, DOW_S, EXTRA_VISUALS, MONTHS, SECURITY_ROLES, THEMES, TURNO_DEF } from "./src/config";
import { Av, EyeIcon, LoginScreenComponent } from "./src/components";
import { DEFAULT_ADMINS, simpleHash, cshift, dim, dow, formatDateTime, mk, stableStringify, countAbsencesForYear, computeStats, getThemeBySchedule } from "./src/utils";

// --- ICONOS Y COMPONENTES VISUALES ---

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
  const todayKey = mk(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const [session, setSession] = useState(null);
  const [admins, setAdmins] = useState(DEFAULT_ADMINS);
  const [ops, setOps] = useState([]);
  const [off, setOff] = useState(-11);
  const [view, setView] = useState("daily");
  const [activeYear, setAY] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const themeMode = "light";
  const [showConfigPass, setShowConfigPass] = useState(false);
  const [printMode, setPrintMode] = useState("annual");
  const [printOpId, setPrintOpId] = useState("");
  const [plans, setPlans] = useState({});
  const [securityPlan, setSecurityPlan] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

useEffect(() => {
  onValue(ref(db, 'ops'), (s) => { if (s.val()) setOps(s.val()); });
  onValue(ref(db, 'admins'), (s) => { if (s.val()) setAdmins(s.val()); });
  onValue(ref(db, 'offset'), (s) => { if (s.val() !== null) setOff(s.val()); });
  onValue(ref(db, 'plans'), (s) => { setPlans(s.val() || {}); });
  onValue(ref(db, 'securityPlans'), (s) => { setSecurityPlan(s.val() || {}); });
}, []);


const saveOps = (n) => {
  setOps(n);
  set(ref(db, 'ops'), n).catch((error) => {
    console.error("Error guardando operadores:", error);
    alert("No se han podido guardar los cambios. Revisa la conexión.");
  });
};


const toggleSecurityRole = (operatorId, roleId) => {
  const operator = ops.find(op => op.id === operatorId);
  const currentRoles = Array.isArray(operator?.securityRoles) ? operator.securityRoles : [];
  const hasRole = currentRoles.includes(roleId);

  if (roleId === "DCS") {
    const confirmed = window.confirm(
      hasRole
        ? "Vas a quitar el rol DCS a este operador. Dejará de aparecer en el calendario de Sala de Control y puede requerir recalcular la planificación. ¿Quieres continuar?"
        : "Vas a añadir el rol DCS a este operador. Aparecerá en el calendario de Sala de Control y puede requerir recalcular la planificación. ¿Quieres continuar?"
    );

    if (!confirmed) return;
  }

  const updatedOps = ops.map(op => {
    if (op.id !== operatorId) return op;

    const roles = Array.isArray(op.securityRoles) ? op.securityRoles : [];
    const active = roles.includes(roleId);

    return {
      ...op,
      securityRoles: active
        ? roles.filter(id => id !== roleId)
        : [...roles, roleId]
    };
  });

  saveOps(updatedOps);
};

const saveAdmins = (n) => set(ref(db, 'admins'), n);


const saveOff = (n) => {
  setOff(n);
  set(ref(db, 'offset'), n).catch((error) => {
    console.error("Error guardando offset:", error);
    alert("No se ha podido guardar el offset. Revisa la conexión.");
  });
};
const saveSecurityPlans = (nextSecurityPlans) => {
  setSecurityPlan(nextSecurityPlans);

  set(ref(db, 'securityPlans'), nextSecurityPlans).catch((error) => {
    console.error("Error guardando planificación de seguridad:", error);
    alert("No se ha podido guardar la planificación de seguridad. Revisa la conexión.");
  });
};

  useEffect(() => {
  if (session) {
    const now = new Date();
    setAY(now.getFullYear());
    setMonth(now.getMonth());
  }
}, [session]);

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

 const needsPlanning = view === "calendar" || view === "stats";

 const dcsOps = useMemo(
  () => ops.filter(op => Array.isArray(op.securityRoles) && op.securityRoles.includes("DCS")),
  [ops]
);

  const dcsPlanningFingerprint = useMemo(() => {
  return dcsOps.map(op => ({
    id: op.id,
    calendar: op.calendar || {}
  }));
}, [dcsOps]);

const currentPlanHash = useMemo(
  () => stableStringify({ ops: dcsPlanningFingerprint, off }),
  [dcsPlanningFingerprint, off]
);
  const savedPlanData = plans?.[activeYear] || null;
  const hasSavedPlan = !!savedPlanData?.assign && Object.keys(savedPlanData.assign).length > 0;
  const planHasPendingChanges = hasSavedPlan && savedPlanData.inputHash !== currentPlanHash;

  const asgn = useMemo(() => savedPlanData?.assign || {}, [savedPlanData]);
  const stats = useMemo(() => computeStats(dcsOps, activeYear, asgn, off), [dcsOps, activeYear, asgn, off]);

  const activeSecurityPlan = securityPlan?.[activeYear] || null;
  const activeSecurityDaysCount = activeSecurityPlan?.days
  ? Object.keys(activeSecurityPlan.days).length
  : 0;
  

const todayLabel = today.toLocaleDateString("es-ES", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric"
});
const todayDcsOperators = useMemo(() => {
  const todayAssignments = savedPlanData?.assign?.[todayKey] || {};

  return dcsOps.filter(op => todayAssignments?.[op.id] === "SC");
}, [savedPlanData, todayKey, dcsOps]);
 const activeSecurityMonthSummary = useMemo(() => {
  if (!activeSecurityPlan?.days) {
    return {
      totalDays: 0,
      completeDays: 0,
      warningDays: 0,
      missingAssignments: 0
    };
  }

  const roleIds = ["DCS", "BRIGADA", "COORDINADOR_EMERGENCIAS", "CONTEO"];
  const totalDays = dim(activeYear, month);

  return Array.from({ length: totalDays }).reduce(
    (summary, _, index) => {
      const dayNumber = index + 1;
      const dateKey = `${activeYear}-${month + 1}-${dayNumber}`;
      const dayPlan = activeSecurityPlan.days?.[dateKey] || {};

      const assignedCount = roleIds.filter(roleId => Boolean(dayPlan?.[roleId])).length;
      const missingCount = roleIds.length - assignedCount;
      const hasWarnings = Array.isArray(dayPlan.warnings) && dayPlan.warnings.length > 0;

      const isRestDay = assignedCount === 0;

      summary.totalDays += 1;

      if (isRestDay) {
        return summary;
      }

      if (assignedCount === roleIds.length && !hasWarnings) {
        summary.completeDays += 1;
      }

      if (hasWarnings || missingCount > 0) {
        summary.warningDays += 1;
      }

      summary.missingAssignments += missingCount;

      return summary;
    },
    {
      totalDays: 0,
      completeDays: 0,
      warningDays: 0,
      missingAssignments: 0
    }
  );
}, [activeSecurityPlan, activeYear, month]);
  const getOperatorNameById = (operatorId) => {
  return ops.find(op => String(op.id) === String(operatorId))?.name || "Sin asignar";
};
  const handleRecalculatePlan = async () => {
    if (!isAdmin) return;

    if (dcsOps.length === 0) {
  alert("No hay operadores con rol DCS para generar la planificación de Sala de Control.");
  return; 
}

    const confirmMessage = hasSavedPlan
      ? `Vas a recalcular la planificación oficial de ${activeYear}. Esto puede cambiar el calendario completo de ese año. ¿Quieres continuar?`
      : `Vas a generar la planificación oficial de ${activeYear}. ¿Quieres continuar?`;

    if (!window.confirm(confirmMessage)) return;

    setIsRecalculating(true);

    try {
      const newPlan = autoAssign(dcsOps, activeYear, off);

      const planPayload = {
        assign: newPlan,
        inputHash: currentPlanHash,
        updatedAt: new Date().toISOString(),
        updatedBy: session?.user || "Administrador",
        year: activeYear
      };

      setPlans(prev => ({ ...prev, [activeYear]: planPayload }));
      await set(ref(db, `plans/${activeYear}`), planPayload);
    } catch (error) {
      console.error("Error recalculando planificación:", error);
      alert("No se ha podido recalcular la planificación.");
    } finally {
      setIsRecalculating(false);
    }
  };
const handleGenerateSecurityPlan = async () => {
  if (!isAdmin) return;

  const confirmed = window.confirm(
    `Vas a generar la planificación de seguridad para ${activeYear}. Esta planificación es independiente del Calendario DCS. ¿Quieres continuar?`
  );

  if (!confirmed) return;

  const newSecurityPlan = generateSecurityPlan({
  operators: ops,
  year: activeYear,
  dcsPlan: asgn,
  off
});

  const nextSecurityPlans = {
    ...(securityPlan || {}),
    [activeYear]: newSecurityPlan
  };

  saveSecurityPlans(nextSecurityPlans);
};
  const currentMonthLabel = `${MONTHS[month]} ${activeYear}`;const selectedPrintOp = useMemo(() => dcsOps.find(op => String(op.id) === String(printOpId)) || dcsOps[0] || null, [dcsOps, printOpId]);
  
  const selectedPrintStats = useMemo(() => stats.find(op => String(op.id) === String(selectedPrintOp?.id)), [stats, selectedPrintOp]);
  const generatedAt = formatDateTime(new Date());
  

  useEffect(() => {
  if (!printOpId && dcsOps[0]?.id) {
    setPrintOpId(String(dcsOps[0].id));
  }
}, [dcsOps, printOpId]);

  const handlePrevMonth = () => { if (month === 0) { setMonth(11); setAY(v => v - 1); } else setMonth(month - 1); };
  const handleNextMonth = () => { if (month === 11) { setMonth(0); setAY(v => v + 1); } else setMonth(month + 1); };



const getTodayDcsOperators = () => {
  return dcsOps
    .filter(op => {
      const abs = op.calendar?.[todayKey];
      const rot = cshift(activeYear, month, today.getDate(), off);
      const calcAsgn = asgn[todayKey]?.[op.id];
      const finalCode = abs || calcAsgn || rot;

      return finalCode === "SC";
    })
    .map(op => op.name);
};

const todaySecurityDay =
  activeSecurityPlan?.days?.[todayKey] ||
  activeSecurityPlan?.assignments?.[todayKey] ||
  activeSecurityPlan?.assign?.[todayKey] ||
  {};
const todayAbsences = ops.filter(op => {
  const code = op.calendar?.[todayKey];
  return ["VA", "EN", "BA"].includes(code);
});
const getTodaySecurityRoleName = (roleId) => {
  const value = todaySecurityDay?.[roleId];

  if (!value) return "Sin asignar";

  if (Array.isArray(value)) {
    return value.map(id => getOperatorNameById(id)).join(", ");
  }

  if (typeof value === "object") {
    return value.name || getOperatorNameById(value.id);
  }

  return getOperatorNameById(value);
};

const dailySummary = [
  {
    title: "DCS",
    value: getTodayDcsOperators().join(", ") || "Sin asignar",
  },
  {
    title: "Brigada",
    value: getTodaySecurityRoleName("BRIGADA"),
  },
  {
    title: "Coordinador de Emergencias",
    value: getTodaySecurityRoleName("COORDINADOR_EMERGENCIAS"),
  },
  {
    title: "Conteo",
    value: getTodaySecurityRoleName("CONTEO"),
  },
];

if (!session) {
  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef7f3 46%, #f8fafc 100%)"
      }}
    >
      <style>{`
        html,
        body,
        #root {
          height: 100%;
          margin: 0;
          overflow: hidden;
        }
      `}</style>

      <div
        style={{
          height: "100%",
          transform: "translateY(-34px) scale(0.94)",
          transformOrigin: "top center"
        }}
      >
        <LoginScreenComponent
          admins={admins}
          onLogin={(newSession) => {
            setSession(newSession);
            setView("daily");
          }}
          theme={t}
        />
      </div>
    </div>
  );
} 

  return (
   <div style={{
  minHeight: "100vh",
  background: "linear-gradient(180deg, #f8fafc 0%, #eef7f3 46%, #f8fafc 100%)",
  color: t.text,
  fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  transition: "background 0.3s"
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
        .glass-panel { background: rgba(255, 255, 255, 0.88); border: 1px solid rgba(203, 213, 225, 0.78); box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .hero-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 24px.glass-panel ; }
        .hero-card { border-radius: 22px; padding: 22px; }
        .hero-title { font-size: 28px; font-weight: 800; color: ${t.title}; margin: 0 0 8px; letter-spacing: -0.02em; }
        .hero-sub { color: ${t.sub}; font-size: 14px; line-height: 1.5; margin: 0; }
        .hero-kpi-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${t.sub}; margin-bottom: 8px; }
        .hero-kpi-value { font-size: 28px; font-weight: 800; color: ${t.title}; }
        .section-card { border-radius: 24px; }
        .calendar-container { background: rgba(255, 255, 255, 0.92); border-radius: 24px; overflow-x: auto; border: 1px solid rgba(203, 213, 225, 0.78); margin-bottom: 40px; box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08); position: relative; -webkit-overflow-scrolling: touch; }
.calendar-grid { display: grid; grid-template-columns: 150px repeat(${dim(activeYear, month)}, minmax(46px, 1fr)); gap: 0px; width: max-content; min-width: 100%; background: rgba(226, 232, 240, 0.55); }
@media (min-width: 1024px) { .calendar-grid { width: 100%; grid-template-columns: 165px repeat(${dim(activeYear, month)}, 1fr); } .cell-day { min-width: 0 !important; } }
@media (max-width: 980px) { .hero-grid { grid-template-columns: 1fr; } }
.sticky-col { position: sticky; left: 0; background: #ffffff !important; z-index: 50; border-right: 1px solid rgba(203, 213, 225, 0.90) !important; box-sizing: border-box; }
.cell-day { height: 42px; display: flex; align-items: center; justify-content: center; border-top: 1px solid rgba(203, 213, 225, 0.78); border-right: 1px solid rgba(203, 213, 225, 0.78); font-size: 11px; box-sizing: border-box; transition: transform 0.12s ease, box-shadow 0.12s ease; }
.cell-day:hover { box-shadow: inset 0 0 0 2px rgba(8, 145, 118, 0.20); }
.header-day { height: 62px !important; flex-direction: column; gap: 3px; background: #f8fafc !important; }
        .soft-button { background: ${t.card}; color: ${t.text}; border: 1px solid ${t.border}; border-radius: 12px; padding: 10px 14px; cursor: pointer; fontSize: 12px; }
        .soft-input { width: 100%; border-radius: 12px; border: 1px solid ${t.border}; background: ${t.shell}; color: ${t.text}; }
        .print-only { display: none; }
      `}</style>

    <header
  className="no-print glass-panel"
  style={{
    margin: "14px 14px 0",
    padding: "16px 18px",
    display: "flex",
    justifyContent: "space-between",
    borderRadius: 24,
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap"
  }}
>
  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 16,
        background: "#ffffff",
        border: `1px solid ${t.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.06)"
      }}
    >
      <img
        src={cortevaLogo}
        alt="Corteva"
        style={{
          width: 34,
          height: "auto",
          objectFit: "contain"
        }}
      />
    </div>

    <div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 900,
          color: t.title,
          letterSpacing: "-0.02em",
          lineHeight: 1.1
        }}
      >
        Gestión de personal
      </div>

      <div
        style={{
          marginTop: 4,
          fontSize: 12,
          color: t.sub,
          fontWeight: 700
        }}
      >
        Sala de Control · Corteva
      </div>
    </div>

    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 14,
        background: t.shell,
        border: `1px solid ${t.border}`
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: t.sub,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.07em"
        }}
      >
        Año
      </span>

      <select
        value={activeYear}
        onChange={e => setAY(Number(e.target.value))}
        style={{
          background: "#ffffff",
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 13,
          fontWeight: 800,
          minWidth: 96
        }}
      >
        {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  </div>

  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 16,
        background: t.shell,
        border: `1px solid ${t.border}`
      }}
    >
      <div style={{ fontSize: 11, color: t.sub, marginBottom: 3, fontWeight: 800 }}>
        Sesión activa
      </div>

      <div style={{ fontSize: 13, fontWeight: 900, color: t.title }}>
        {sessionDisplayRole || sessionDisplayName}
      </div>
    </div>

    <button
      onClick={() => setSession(null)}
      style={{
        background: "rgba(239, 68, 68, 0.08)",
        color: "#dc2626",
        border: "1px solid rgba(239, 68, 68, 0.22)",
        padding: "11px 14px",
        borderRadius: 14,
        fontSize: 12,
        fontWeight: 900,
        cursor: "pointer"
      }}
    >
      Cerrar sesión
    </button>
  </div>
</header>

      <nav
  className="no-print glass-panel"
  style={{
    display: "flex",
    margin: "14px 14px 0",
    padding: 10,
    borderRadius: 24,
    justifyContent: "center"
  }}
>
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      width: "100%",
      maxWidth: 980,
      gap: 8
    }}
  >
    {[
      { id: "daily", label: "Operativa diaria", short: "" },
      { id: "calendar", label: "Calendario DCS", short: "" },
      { id: "security", label: "Calendario Seguridad", short: "" },
      { id: "stats", label: "Estadísticas", short: "Datos" },
      canSeeEditor && { id: "editor", label: "Personal", short: "Equipo" },
      isAdmin && { id: "config", label: "Administración", short: "Ajustes" }
    ]
      .filter(Boolean)
      .map(item => {
        const active = view === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            style={{
              padding: "12px 12px",
              color: active ? t.title : t.sub,
              background: active ? "rgba(8, 145, 118, 0.12)" : "transparent",
              border: `1px solid ${active ? "rgba(8, 145, 118, 0.26)" : "transparent"}`,
              cursor: "pointer",
              borderRadius: 16,
              fontSize: 12,
              fontWeight: 900,
              textAlign: "left",
              transition: "all 0.18s ease",
              boxShadow: active ? "0 8px 18px rgba(15, 23, 42, 0.06)" : "none"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: active ? t.accent : "rgba(100, 116, 139, 0.28)",
                  flex: "0 0 auto"
                }}
              />

              <div>
                <div style={{ lineHeight: 1.15 }}>
                  {item.label}
                </div>

                {item.short && (
  <div
    style={{
      marginTop: 4,
      fontSize: 10,
      color: active ? t.accent : t.sub,
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      fontWeight: 900
    }}
  >
    {item.short}
  </div>
)}
              </div>
            </div>
          </button>
        );
      })}
  </div>
</nav>

      <main className="app-shell">
       {view === "daily" && (
  <div className="glass-panel section-card" style={{ padding: 28 }}>
  
    <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 28,
    flexWrap: "wrap"
  }}
>
  <div>
    

    <h1
  style={{
    margin: 0,
    color: t.title,
    fontSize: 34,
    letterSpacing: "-0.03em",
    lineHeight: 1.05
  }}
>
  Resumen operativo de hoy
</h1>

<p style={{ marginTop: 10, marginBottom: 0, color: t.sub, fontSize: 15, lineHeight: 1.5 }}>
  Puestos principales asignados para la jornada actual.
</p>
  </div>

  <div
    style={{
      padding: "14px 18px",
      borderRadius: 18,
      background: t.shell,
      border: `1px solid ${t.border}`,
      color: t.title,
      fontWeight: 800,
      minWidth: 190,
      textAlign: "center"
    }}
  >
    <div style={{ fontSize: 12, color: t.sub, marginBottom: 4 }}>
      Fecha actual
    </div>
    <div style={{ fontSize: 17, textTransform: "capitalize" }}>
  {todayLabel}
</div>
  </div>
</div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16
      }}
    >
   {dailySummary.map(({ title, value }) => {
  const assigned = value && value !== "Sin asignar";
  const names = assigned
    ? String(value).split(",").map(name => name.trim()).filter(Boolean)
    : [];

  return (
    <div
      key={title}
      style={{
        background: t.shell,
        border: `1px solid ${assigned ? t.border : "rgba(245, 158, 11, 0.45)"}`,
        borderRadius: 22,
        padding: 20,
        minHeight: 150,
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)"
      }}
    >
      

      <h2 style={{ margin: "0 0 12px", color: t.title, fontSize: 21, lineHeight: 1.15 }}>
        {title}
      </h2>

      {assigned ? (
        <div style={{ display: "grid", gap: 8 }}>
          {names.map((name, index) => (
            <div
              key={`${title}-${name}-${index}`}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                background: "#ffffff",
                border: `1px solid ${t.border}`,
                color: t.title,
                fontWeight: 800,
                fontSize: 14
              }}
            >
              {name}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 14,
            background: "rgba(245, 158, 11, 0.10)",
            border: "1px solid rgba(245, 158, 11, 0.26)",
            color: "#92400e",
            fontWeight: 800,
            fontSize: 14
          }}
        >
          Sin asignar
        </div>
      )}
    </div>
  );
})}
</div>

<div
  style={{
    marginTop: 26,
    padding: 22,
    borderRadius: 22,
    background: "rgba(248, 250, 252, 0.72)",
    border: `1px solid ${t.border}`
  }}
>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 14,
      marginBottom: 18,
      flexWrap: "wrap"
    }}
  >
    <div>
      
      <h2 style={{ margin: 0, color: t.title, fontSize: 24 }}>
        Ausencias de hoy
      </h2>

      <p style={{ marginTop: 7, marginBottom: 0, color: t.sub, fontSize: 14 }}>
        Personal con vacaciones, entrenamiento o baja registrado en la jornada.
      </p>
    </div>

    <div
      style={{
        padding: "10px 14px",
        borderRadius: 999,
        background: "#ffffff",
        border: `1px solid ${t.border}`,
        color: t.title,
        fontWeight: 900,
        fontSize: 13
      }}
    >
      {todayAbsences.length} ausencias
    </div>
  </div>

  {todayAbsences.length > 0 ? (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 12
      }}
    >
      {todayAbsences.map(op => {
        const code = op.calendar?.[todayKey];

        const label =
          code === "VA"
            ? "Vacaciones"
            : code === "EN"
            ? "Entrenamiento"
            : code === "BA"
            ? "Baja"
            : code;

        const absenceColor =
          code === "VA"
            ? "#059669"
            : code === "EN"
            ? "#6366f1"
            : "#ef4444";

        return (
          <div
            key={op.id}
            style={{
              background: "#ffffff",
              border: `1px solid ${t.border}`,
              borderRadius: 18,
              padding: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Av name={op.name} color={op.color} size={30} />

              <div>
                <div style={{ fontWeight: 900, color: t.title, marginBottom: 2 }}>
                  {op.name}
                </div>

                <div style={{ fontSize: 13, color: t.sub }}>
                  {label}
                </div>
              </div>
            </div>
        
          </div>
        );
      })}
    </div>
  ) : (
    <div
      style={{
        background: "#ffffff",
        border: `1px dashed ${t.border}`,
        borderRadius: 18,
        padding: 20,
        color: t.sub,
        fontSize: 14,
        fontWeight: 700
      }}
    >
      No hay ausencias registradas hoy.
    </div>
  )}
</div>
  </div>
)}
        {view === "calendar" && (
          <div>
          <div
  className="glass-panel section-card no-print"
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    marginBottom: 20,
    alignItems: "stretch",
    padding: 20,
    flexWrap: "wrap",
    borderRadius: 24
  }}
>
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      gap: 14,
      minWidth: 260,
      flex: "1 1 300px"
    }}
  >
    <div>
      
      <h2
        style={{
          margin: 0,
          fontSize: 30,
          color: t.title,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          textTransform: "capitalize"
        }}
      >
        {currentMonthLabel}
      </h2>

      <p
        style={{
          marginTop: 10,
          marginBottom: 0,
          color: t.sub,
          fontSize: 14,
          lineHeight: 1.5
        }}
      >
        Vista mensual de Sala de Control, turnos, ausencias y asignaciones SC.
      </p>
    </div>

    {isAdmin && (
      <button
        onClick={handleRecalculatePlan}
        disabled={isRecalculating}
        style={{
          alignSelf: "flex-start",
          padding: "11px 15px",
          borderRadius: 14,
          border: `1px solid ${planHasPendingChanges || !hasSavedPlan ? "rgba(245, 158, 11, 0.55)" : "rgba(8, 145, 118, 0.26)"}`,
          background: planHasPendingChanges || !hasSavedPlan ? "rgba(245, 158, 11, 0.16)" : "rgba(8, 145, 118, 0.12)",
          color: planHasPendingChanges || !hasSavedPlan ? "#92400e" : t.title,
          cursor: isRecalculating ? "not-allowed" : "pointer",
          fontSize: 12,
          fontWeight: 900
        }}
      >
        {isRecalculating ? "Calculando..." : hasSavedPlan ? "Recalcular planificación" : "Generar planificación"}
      </button>
    )}
  </div>

  <div
    style={{
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      flex: "1 1 420px",
      padding: 14,
      borderRadius: 20,
      background: "rgba(248, 250, 252, 0.72)",
      border: `1px solid ${t.border}`
    }}
  >
    <button
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        border: `1px solid ${t.border}`,
        background: "#ffffff",
        color: t.text,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 900
      }}
      onClick={handlePrevMonth}
    >
      Mes anterior
    </button>

    <button
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        border: "1px solid rgba(8, 145, 118, 0.26)",
        background: "rgba(8, 145, 118, 0.12)",
        color: t.title,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 900
      }}
      onClick={handleNextMonth}
    >
      Mes siguiente
    </button>
          {isAdmin && (
      <button
        type="button"
        onClick={() => {
          const nextOffset = window.prompt(
            "Introduce el valor de sincronización del calendario:",
            String(off)
          );

          if (nextOffset === null) return;

          const cleanOffset = Number(nextOffset);

          if (Number.isNaN(cleanOffset)) {
            alert("Introduce un número válido.");
            return;
          }

          saveOff(cleanOffset);
        }}
        title="Ajustar sincronización del calendario DCS"
        style={{
          padding: "10px 13px",
          borderRadius: 14,
          border: "1px solid rgba(8, 145, 118, 0.26)",
          background: "#ffffff",
          color: t.title,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 900,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          whiteSpace: "nowrap"
        }}
      >
        Sincronización del calendario
        <span
          style={{
            padding: "3px 7px",
            borderRadius: 999,
            background: "rgba(8, 145, 118, 0.10)",
            color: t.accent,
            fontSize: 11,
            fontWeight: 900
          }}
        >
          {off}
        </span>
      </button>
    )}
    <select
      value={printMode}
      onChange={e => setPrintMode(e.target.value)}
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        border: `1px solid ${t.border}`,
        background: "#ffffff",
        color: t.text,
        fontSize: 12,
        fontWeight: 800,
        minWidth: 220
      }}
    >
      <option value="annual">Exportación anual completa</option>
      <option value="individual">Calendario individual</option>
    </select>

    {printMode === "individual" && (
      <select
        value={printOpId}
        onChange={e => setPrintOpId(e.target.value)}
        style={{
          padding: "10px 14px",
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          background: "#ffffff",
          color: t.text,
          fontSize: 12,
          fontWeight: 800,
          minWidth: 220
        }}
      >
        {dcsOps.map(op => (
          <option key={op.id} value={String(op.id)}>
            {op.name}
          </option>
        ))}
      </select>
    )}

    <button
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        border: `1px solid ${t.border}`,
        background: "#ffffff",
        color: t.text,
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 900
      }}
      onClick={() => window.print()}
    >
      Exportar PDF / Imprimir
    </button>
  </div>
</div>
                        {!hasSavedPlan && (
              <div className="glass-panel section-card no-print" style={{ padding: 16, marginBottom: 16, border: '1px solid rgba(245, 158, 11, 0.45)', background: 'rgba(245, 158, 11, 0.12)' }}>
                <div style={{ fontWeight: 800, color: t.title, marginBottom: 4 }}>No hay planificación oficial generada para {activeYear}</div>
                <div style={{ fontSize: 13, color: t.sub }}>
                  El calendario no se calculará automáticamente. Un administrador debe pulsar “Generar planificación”.
                </div>
              </div>
            )}

            {hasSavedPlan && planHasPendingChanges && (
              <div className="glass-panel section-card no-print" style={{ padding: 16, marginBottom: 16, border: '1px solid rgba(245, 158, 11, 0.45)', background: 'rgba(245, 158, 11, 0.12)' }}>
                <div style={{ fontWeight: 800, color: t.title, marginBottom: 4 }}>Hay cambios pendientes sin recalcular</div>
                <div style={{ fontSize: 13, color: t.sub }}>
                  Has modificado personal, ausencias u offset. La planificación oficial sigue estable hasta que pulses “Recalcular planificación”.
                </div>
              </div>
            )}
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
                {dcsOps.map(op => (
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
<div
  style={{
    padding: "18px",
    borderTop: `1px solid ${t.border}`,
    background: "rgba(248, 250, 252, 0.72)"
  }}
>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      marginBottom: 14,
      flexWrap: "wrap"
    }}
  >
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          color: t.accent,
          fontWeight: 900,
          marginBottom: 5
        }}
      >
        Leyenda
      </div>

      <div style={{ color: t.title, fontSize: 16, fontWeight: 900 }}>
        Códigos del calendario
      </div>
    </div>
  
  </div>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: 10
    }}
  >
    {CALENDAR_LEGEND.map(item => (
      <div
        key={item.code}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 14,
          background: "#ffffff",
          border: `1px solid ${t.border}`,
          minHeight: 46
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: item.color,
            color: item.textColor,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 900,
            flex: "0 0 auto"
          }}
        >
          {item.code}
        </span>

        <span
          style={{
            color: t.title,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: 1.2
          }}
        >
          {item.label}
        </span>
      </div>
    ))}
  </div>
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
{view === "security" && (
  <div className="glass-panel section-card" style={{ padding: 24 }}>
    <div
  style={{
    marginBottom: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: 18,
    flexWrap: "wrap"
  }}
>
  <div
    style={{
      flex: "1 1 320px",
      padding: 20,
      borderRadius: 22,
      background: "rgba(248, 250, 252, 0.72)",
      border: `1px solid ${t.border}`
    }}
  >
    
    <h2
      style={{
        margin: 0,
        color: t.title,
        fontSize: 30,
        letterSpacing: "-0.03em",
        lineHeight: 1.05
      }}
    >
      Planificación de roles de seguridad
    </h2>

    <p
      style={{
        margin: "10px 0 0",
        color: t.sub,
        fontSize: 14,
        lineHeight: 1.5
      }}
    >
      Vista mensual para Brigada, DCS, Coordinador de Emergencias y Conteo.
    </p>
  </div>

  <div
    style={{
      flex: "1 1 300px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      gap: 14,
      padding: 20,
      borderRadius: 22,
      background: "#ffffff",
      border: `1px solid ${t.border}`,
      boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)"
    }}
  >
    <div>
      <div
        style={{
          fontSize: 11,
          color: t.sub,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6
        }}
      >
        Estado de planificación
      </div>

      <div style={{ color: t.title, fontSize: 18, fontWeight: 900 }}>
        {activeSecurityPlan ? `Plan activo ${activeYear}` : "Sin planificación generada"}
      </div>

      {activeSecurityPlan?.meta?.generatedAt && (
        <div style={{ marginTop: 6, color: t.sub, fontSize: 13, fontWeight: 700 }}>
          {activeSecurityDaysCount} días creados
        </div>
      )}
    </div>

    {isAdmin && (
      <button
        onClick={handleGenerateSecurityPlan}
        style={{
          alignSelf: "flex-start",
          padding: "11px 15px",
          borderRadius: 14,
          border: activeSecurityPlan
            ? "1px solid rgba(8, 145, 118, 0.26)"
            : "1px solid rgba(245, 158, 11, 0.50)",
          background: activeSecurityPlan
            ? "rgba(8, 145, 118, 0.12)"
            : "rgba(245, 158, 11, 0.16)",
          color: activeSecurityPlan ? t.title : "#92400e",
          fontWeight: 900,
          cursor: "pointer",
          fontSize: 12
        }}
      >
        {activeSecurityPlan ? "Regenerar planificación seguridad" : "Generar planificación seguridad"}
      </button>
    )}
  </div>
</div>
{activeSecurityPlan?.days && (
  <div
    style={{
      marginTop: 26,
      border: `1px solid ${t.border}`,
      background: "rgba(248, 250, 252, 0.72)",
      borderRadius: 24,
      padding: 20
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "stretch",
        gap: 16,
        marginBottom: 18,
        flexWrap: "wrap"
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: t.accent,
            marginBottom: 6,
            fontWeight: 900
          }}
        >
          Calendario mensual de seguridad
        </div>

        <h3
          style={{
            margin: 0,
            color: t.title,
            fontSize: 26,
            letterSpacing: "-0.03em",
            lineHeight: 1.1
          }}
        >
          {MONTHS[month]} {activeYear}
        </h3>

        <p style={{ margin: "8px 0 0", color: t.sub, fontSize: 14, lineHeight: 1.45 }}>
          Revisión mensual de roles asignados y posibles avisos de cobertura.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "flex-end"
        }}
      >
        <button
          onClick={() => {
            if (month === 0) {
              setAY(activeYear - 1);
              setMonth(11);
            } else {
              setMonth(month - 1);
            }
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 14,
            border: `1px solid ${t.border}`,
            background: "#ffffff",
            color: t.text,
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12
          }}
        >
          Mes anterior
        </button>

        <button
          onClick={() => {
            if (month === 11) {
              setAY(activeYear + 1);
              setMonth(0);
            } else {
              setMonth(month + 1);
            }
          }}
          style={{
            padding: "10px 14px",
            borderRadius: 14,
            border: "1px solid rgba(8, 145, 118, 0.26)",
            background: "rgba(8, 145, 118, 0.12)",
            color: t.title,
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12
          }}
        >
          Mes siguiente
        </button>
      </div>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12,
        marginBottom: 18
      }}
    >
      {[
        ["Días del mes", activeSecurityMonthSummary.totalDays, "Total"],
        ["Días completos", activeSecurityMonthSummary.completeDays, "OK"],
        ["Días con avisos", activeSecurityMonthSummary.warningDays, "Revisar"],
        ["Puestos pendientes", activeSecurityMonthSummary.missingAssignments, "Pendiente"]
      ].map(([label, value, tag]) => {
        const isWarning = label === "Días con avisos" || label === "Puestos pendientes";
        const hasValue = Number(value) > 0;

        return (
          <div
            key={label}
            style={{
              border: `1px solid ${isWarning && hasValue ? "rgba(245, 158, 11, 0.40)" : t.border}`,
              background: "#ffffff",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
                marginBottom: 10
              }}
            >
              <div
                style={{
                  color: t.sub,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 900
                }}
              >
                {label}
              </div>

              <span
                style={{
                  padding: "5px 8px",
                  borderRadius: 999,
                  background: isWarning && hasValue ? "rgba(245, 158, 11, 0.14)" : "rgba(8, 145, 118, 0.10)",
                  color: isWarning && hasValue ? "#92400e" : "#15803d",
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}
              >
                {tag}
              </span>
            </div>

            <div
              style={{
                color: t.title,
                fontSize: 28,
                fontWeight: 900,
                lineHeight: 1
              }}
            >
              {value}
            </div>
          </div>
        );
      })}
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 12
      }}
    >
      {Array.from({ length: dim(activeYear, month) }).map((_, i) => {
        const dayNumber = i + 1;
        const dateKey = `${activeYear}-${month + 1}-${dayNumber}`;
        const dayPlan = activeSecurityPlan.days?.[dateKey] || {};
        const isToday =
          today.getFullYear() === activeYear &&
          today.getMonth() === month &&
          today.getDate() === dayNumber;

        const roleRows = [
          ["DCS", "DCS"],
          ["BRIGADA", "Brigada"],
          ["COORDINADOR_EMERGENCIAS", "Coord."],
          ["CONTEO", "Conteo"]
        ];

const dayWarnings = dayPlan.warnings || [];
const assignedRolesCount = roleRows.filter(([roleId]) => dayPlan?.[roleId]).length;
const isRestDay = assignedRolesCount === 0;
const hasWarnings = !isRestDay && dayWarnings.length > 0;
const isComplete = !isRestDay && assignedRolesCount === roleRows.length;

const statusText = hasWarnings
  ? "Aviso"
  : isRestDay
  ? "Descanso"
  : isComplete
  ? "Completo"
  : "Pendiente";

const statusColor = hasWarnings
  ? "#dc2626"
  : isRestDay
  ? "#475569"
  : isComplete
  ? "#15803d"
  : "#b45309";

const statusBg = hasWarnings
  ? "rgba(239, 68, 68, 0.10)"
  : isRestDay
  ? "rgba(100, 116, 139, 0.12)"
  : isComplete
  ? "rgba(22, 163, 74, 0.10)"
  : "rgba(245, 158, 11, 0.14)";

        return (
          <div
            key={dateKey}
            style={{
              border: `1px solid ${
  isToday
    ? "rgba(8, 145, 118, 0.55)"
    : isRestDay
    ? "rgba(148, 163, 184, 0.45)"
    : t.border
}`,
background: isRestDay
  ? "rgba(241, 245, 249, 0.72)"
  : isToday
  ? "rgba(8, 145, 118, 0.08)"
  : "#ffffff",
borderRadius: 18,
padding: 14,
boxShadow: isToday
  ? "0 12px 26px rgba(8, 145, 118, 0.12)"
  : isRestDay
  ? "none"
  : "0 10px 22px rgba(15, 23, 42, 0.05)"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: 12
              }}
            >
              <div>
                <strong style={{ color: t.title, fontSize: 20, lineHeight: 1 }}>
                  {dayNumber}
                </strong>

                <div style={{ color: t.sub, fontSize: 11, marginTop: 4, fontWeight: 700 }}>
                  {dayPlan.dateLabel || `${String(dayNumber).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${activeYear}`}
                </div>
              </div>

              <span
                style={{
                  padding: "5px 8px",
                  borderRadius: 999,
                  background: statusBg,
                  color: statusColor,
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}
              >
                {isToday ? `Hoy · ${statusText}` : statusText}
              </span>
            </div>

            {isRestDay ? (
  <div
    style={{
      padding: "14px 12px",
      borderRadius: 14,
      background: "rgba(100, 116, 139, 0.08)",
      border: "1px solid rgba(100, 116, 139, 0.18)",
      color: "#475569",
      fontWeight: 900,
      fontSize: 13,
      display: "flex",
      flexDirection: "column",
      gap: 4
    }}
  >
    <span>Descanso del turno</span>
    <small style={{ color: t.sub, fontWeight: 700 }}>
      Sin roles de seguridad asignados para esta jornada.
    </small>
  </div>
) : (
  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
    {roleRows.map(([roleId, label]) => {
      const operatorId = dayPlan?.[roleId];
      const assigned = Boolean(operatorId);

      return (
        <div
          key={roleId}
          style={{
            display: "grid",
            gridTemplateColumns: "58px 1fr",
            gap: 8,
            alignItems: "center",
            fontSize: 12,
            padding: "7px 8px",
            borderRadius: 12,
            background: assigned ? "rgba(248, 250, 252, 0.95)" : "rgba(245, 158, 11, 0.08)",
            border: `1px solid ${assigned ? "rgba(226, 232, 240, 0.9)" : "rgba(245, 158, 11, 0.18)"}`
          }}
        >
          <span
            style={{
              color: assigned ? t.sub : "#92400e",
              fontWeight: 900
            }}
          >
            {label}
          </span>

          <strong
            style={{
              color: assigned ? t.title : "#92400e",
              textAlign: "right",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {assigned ? getOperatorNameById(operatorId) : "Sin asignar"}
          </strong>
        </div>
      );
    })}
  </div>
)}

            {hasWarnings && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  borderRadius: 12,
                  background: "rgba(239, 68, 68, 0.08)",
                  color: "#dc2626",
                  fontSize: 11,
                  fontWeight: 900,
                  border: "1px solid rgba(239, 68, 68, 0.16)"
                }}
              >
                {dayWarnings.length} aviso/s
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
)}
        <div
      style={{
        marginTop: 24,
        padding: 20,
        borderRadius: 24,
        background: "rgba(248, 250, 252, 0.72)",
        border: `1px solid ${t.border}`
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          marginBottom: 18,
          flexWrap: "wrap"
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              color: t.accent,
              marginBottom: 8,
              fontWeight: 900
            }}
          >
            Equipo disponible
          </div>

          <h3 style={{ margin: 0, color: t.title, fontSize: 24 }}>
            Operadores por rol de seguridad
          </h3>

          <p style={{ marginTop: 7, marginBottom: 0, color: t.sub, fontSize: 14 }}>
            Personal configurado para Brigada, DCS, Coordinador de Emergencias y Conteo.
          </p>
        </div>

        <div
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            background: "#ffffff",
            border: `1px solid ${t.border}`,
            color: t.title,
            fontWeight: 900,
            fontSize: 13
          }}
        >
          {SECURITY_ROLES.length} roles
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14
        }}
      >
        {SECURITY_ROLES.map(role => {
          const roleOps = ops.filter(op =>
            Array.isArray(op.securityRoles) && op.securityRoles.includes(role.id)
          );

          return (
            <div
              key={role.id}
              style={{
                border: `1px solid ${t.border}`,
                background: "#ffffff",
                borderRadius: 20,
                padding: 18,
                boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  marginBottom: 14
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: t.title,
                      marginBottom: 4
                    }}
                  >
                    {role.label}
                  </div>

                  <div style={{ color: t.sub, fontSize: 12, fontWeight: 700 }}>
                    Personal habilitado
                  </div>
                </div>

                <span
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: roleOps.length > 0
                      ? "rgba(8, 145, 118, 0.10)"
                      : "rgba(245, 158, 11, 0.14)",
                    color: roleOps.length > 0 ? "#15803d" : "#92400e",
                    fontSize: 11,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em"
                  }}
                >
                  {roleOps.length} operadores
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {roleOps.length > 0 ? (
                  roleOps.map(op => (
                    <div
                      key={op.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        color: t.text,
                        fontSize: 13,
                        padding: "9px 10px",
                        borderRadius: 14,
                        background: "rgba(248, 250, 252, 0.95)",
                        border: "1px solid rgba(226, 232, 240, 0.90)"
                      }}
                    >
                      <Av name={op.name} color={op.color} size={26} />

                      <span style={{ fontWeight: 800, color: t.title }}>
                        {op.name}
                      </span>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      color: "#92400e",
                      fontSize: 13,
                      fontWeight: 800,
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "rgba(245, 158, 11, 0.10)",
                      border: "1px solid rgba(245, 158, 11, 0.20)"
                    }}
                  >
                    Sin operadores asignados
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
{activeSecurityPlan?.counters && (
  <div
    style={{
      marginTop: 24,
      padding: 20,
      borderRadius: 24,
      background: "rgba(248, 250, 252, 0.72)",
      border: `1px solid ${t.border}`
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 14,
        marginBottom: 18,
        flexWrap: "wrap"
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.10em",
            color: t.accent,
            marginBottom: 8,
            fontWeight: 900
          }}
        >
          Resumen anual
        </div>

        <h3 style={{ margin: 0, color: t.title, fontSize: 24 }}>
          Reparto de seguridad
        </h3>

        <p style={{ marginTop: 7, marginBottom: 0, color: t.sub, fontSize: 14 }}>
          Número de asignaciones acumuladas por operador en cada rol.
        </p>
      </div>

      <div
        style={{
          padding: "10px 14px",
          borderRadius: 999,
          background: "#ffffff",
          border: `1px solid ${t.border}`,
          color: t.title,
          fontWeight: 900,
          fontSize: 13
        }}
      >
        Año {activeYear}
      </div>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: 14
      }}
    >
      {[
        ["DCS", "DCS seguridad"],
        ["BRIGADA", "Brigada"],
        ["COORDINADOR_EMERGENCIAS", "Coordinador Emergencias"],
        ["CONTEO", "Conteo"]
      ].map(([roleId, title]) => {
        const entries = Object.entries(activeSecurityPlan.counters?.[roleId] || {});
        const sortedEntries = [...entries].sort((a, b) => Number(b[1]) - Number(a[1]));
        const totalAssignments = entries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
        const maxCount = Math.max(1, ...entries.map(([, count]) => Number(count || 0)));

        return (
          <div
            key={roleId}
            style={{
              border: `1px solid ${t.border}`,
              background: "#ffffff",
              borderRadius: 20,
              padding: 18,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 14
              }}
            >
              <div>
                <h4 style={{ margin: 0, color: t.title, fontSize: 16 }}>
                  {title}
                </h4>

                <div style={{ marginTop: 4, color: t.sub, fontSize: 12, fontWeight: 700 }}>
                  Reparto acumulado
                </div>
              </div>

              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: totalAssignments > 0 ? "rgba(8, 145, 118, 0.10)" : "rgba(100, 116, 139, 0.10)",
                  color: totalAssignments > 0 ? "#15803d" : "#475569",
                  fontSize: 11,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}
              >
                {totalAssignments} total
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {sortedEntries.length > 0 ? (
                sortedEntries.map(([operatorId, count]) => {
                  const op = ops.find(item => String(item.id) === String(operatorId));
                  const numericCount = Number(count || 0);
                  const width = `${Math.max(8, Math.round((numericCount / maxCount) * 100))}%`;

                  return (
                    <div
                      key={operatorId}
                      style={{
                        padding: "10px 11px",
                        borderRadius: 15,
                        background: "rgba(248, 250, 252, 0.95)",
                        border: "1px solid rgba(226, 232, 240, 0.90)"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 8
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                          <Av
                            name={op?.name || getOperatorNameById(operatorId)}
                            color={op?.color}
                            size={24}
                          />

                          <span
                            style={{
                              color: t.title,
                              fontSize: 13,
                              fontWeight: 800,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {op?.name || getOperatorNameById(operatorId)}
                          </span>
                        </div>

                        <strong style={{ color: t.title, fontSize: 14 }}>
                          {numericCount}
                        </strong>
                      </div>

                      <div
                        style={{
                          height: 7,
                          borderRadius: 999,
                          background: "rgba(226, 232, 240, 0.90)",
                          overflow: "hidden"
                        }}
                      >
                        <div
                          style={{
                            width,
                            height: "100%",
                            borderRadius: 999,
                            background: "rgba(8, 145, 118, 0.65)"
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    color: "#475569",
                    fontSize: 13,
                    fontWeight: 800,
                    padding: "12px 14px",
                    borderRadius: 14,
                    background: "rgba(100, 116, 139, 0.08)",
                    border: "1px solid rgba(100, 116, 139, 0.18)"
                  }}
                >
                  Sin asignaciones registradas
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
)}
  </div>
)}
        {view === "stats" && (
  <div style={{ display: "grid", gap: 20 }}>
    {(() => {
      const sortedStats = [...stats].sort((a, b) => b.nSC - a.nSC || b.hSC - a.hSC);
      const totalSC = sortedStats.reduce((sum, item) => sum + Number(item.sc || 0), 0);
      const totalHoras = sortedStats.reduce((sum, item) => sum + Number(item.hSC || 0), 0);
      const totalNoches = sortedStats.reduce((sum, item) => sum + Number(item.nSC || 0), 0);
      const maxSC = Math.max(1, ...sortedStats.map(item => Number(item.sc || 0)));

      return (
        <>
          <section
            className="glass-panel section-card"
            style={{
              padding: 24,
              borderRadius: 24
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 20
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    color: t.accent,
                    marginBottom: 8,
                    fontWeight: 900
                  }}
                >
                  Estadísticas
                </div>

                <h2
                  style={{
                    margin: 0,
                    color: t.title,
                    fontSize: 30,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.05
                  }}
                >
                  Resumen anual de Sala de Control
                </h2>

                <p style={{ marginTop: 10, marginBottom: 0, color: t.sub, fontSize: 14, lineHeight: 1.5 }}>
                  Reparto acumulado de servicios SC, horas asignadas y noches por operador.
                </p>
              </div>

              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  background: "#ffffff",
                  border: `1px solid ${t.border}`,
                  color: t.title,
                  fontWeight: 900,
                  fontSize: 13
                }}
              >
                Año {activeYear}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12
              }}
            >
              {[
                ["Servicios SC", totalSC, "Total anual"],
                ["Horas SC", totalHoras, "Horas asignadas"],
                ["Noches SC", totalNoches, "Turnos nocturnos"],
                ["Operadores", sortedStats.length, "Personal DCS"]
              ].map(([label, value, subtitle]) => (
                <div
                  key={label}
                  style={{
                    background: "#ffffff",
                    border: `1px solid ${t.border}`,
                    borderRadius: 18,
                    padding: 16,
                    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)"
                  }}
                >
                  <div
                    style={{
                      color: t.sub,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontWeight: 900,
                      marginBottom: 10
                    }}
                  >
                    {label}
                  </div>

                  <div style={{ color: t.title, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
                    {value}
                  </div>

                  <div style={{ marginTop: 8, color: t.sub, fontSize: 12, fontWeight: 700 }}>
                    {subtitle}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16
            }}
          >
            {sortedStats.map((s, index) => {
              const scCount = Number(s.sc || 0);
              const progressWidth = `${Math.max(8, Math.round((scCount / maxSC) * 100))}%`;

              return (
                <article
                  key={s.id}
                  className="glass-panel section-card"
                  style={{
                    padding: 20,
                    borderRadius: 22,
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      marginBottom: 18
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <Av name={s.name} color={s.color} size={38} />

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 900,
                            color: t.title,
                            fontSize: 17,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {s.name}
                        </div>

                        <div style={{ fontSize: 12, color: t.sub, fontWeight: 700, marginTop: 3 }}>
                          Resumen anual de servicio
                        </div>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: index === 0 ? "rgba(8, 145, 118, 0.12)" : "rgba(100, 116, 139, 0.10)",
                        color: index === 0 ? "#15803d" : "#475569",
                        fontSize: 11,
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em"
                      }}
                    >
                      #{index + 1}
                    </span>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                      <div style={{ fontSize: 34, fontWeight: 900, color: t.title, lineHeight: 1 }}>
                        {s.sc}
                      </div>

                      <div style={{ color: t.sub, fontSize: 13, fontWeight: 800 }}>
                        servicios SC
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        height: 8,
                        borderRadius: 999,
                        background: "rgba(226, 232, 240, 0.90)",
                        overflow: "hidden"
                      }}
                    >
                      <div
                        style={{
                          width: progressWidth,
                          height: "100%",
                          borderRadius: 999,
                          background: "rgba(8, 145, 118, 0.65)"
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                      paddingTop: 14,
                      borderTop: `1px solid ${t.border}`
                    }}
                  >
                    <div
                      style={{
                        padding: "11px 12px",
                        borderRadius: 14,
                        background: "rgba(248, 250, 252, 0.95)",
                        border: "1px solid rgba(226, 232, 240, 0.90)"
                      }}
                    >
                      <div style={{ color: t.sub, fontSize: 11, fontWeight: 900, marginBottom: 5 }}>
                        Horas
                      </div>

                      <strong style={{ color: t.title, fontSize: 18 }}>
                        {s.hSC}
                      </strong>
                    </div>

                    <div
                      style={{
                        padding: "11px 12px",
                        borderRadius: 14,
                        background: "rgba(248, 250, 252, 0.95)",
                        border: "1px solid rgba(226, 232, 240, 0.90)"
                      }}
                    >
                      <div style={{ color: t.sub, fontSize: 11, fontWeight: 900, marginBottom: 5 }}>
                        Noches
                      </div>

                      <strong style={{ color: t.accent, fontSize: 18 }}>
                        {s.nSC}
                      </strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      );
    })()}
  </div>
)}

        {view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} canEdit={canEdit} />}

        {view === "config" && isAdmin && (
                    <div style={{ display: "grid", gap: 20 }}>
            <section
              className="glass-panel section-card"
              style={{
                padding: 24,
                borderRadius: 24
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  flexWrap: "wrap"
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.12em",
                      color: t.accent,
                      marginBottom: 8,
                      fontWeight: 900
                    }}
                  >
                    Administración
                  </div>

                  <h2
                    style={{
                      margin: 0,
                      color: t.title,
                      fontSize: 30,
                      letterSpacing: "-0.03em",
                      lineHeight: 1.05
                    }}
                  >
                    Configuración del sistema
                  </h2>

                  <p
                    style={{
                      marginTop: 10,
                      marginBottom: 0,
                      color: t.sub,
                      fontSize: 14,
                      lineHeight: 1.5
                    }}
                  >
                    Gestión de operadores, desfase del ciclo y accesos administrativos.
                  </p>
                </div>

                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    background: "#ffffff",
                    border: `1px solid ${t.border}`,
                    color: t.title,
                    fontWeight: 900,
                    fontSize: 13
                  }}
                >
                  Modo administrador
                </div>
              </div>
            </section>

            
                        <div
              className="glass-panel section-card"
              style={{
                padding: 24,
                borderRadius: 24
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 14,
                  marginBottom: 18,
                  flexWrap: "wrap"
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                      color: t.accent,
                      marginBottom: 8,
                      fontWeight: 900
                    }}
                  >
                    Personal operativo
                  </div>

                  <h3 style={{ color: t.title, margin: 0, fontSize: 24 }}>
                    Operadores
                  </h3>

                  <p
                    style={{
                      color: t.sub,
                      fontSize: 14,
                      marginTop: 7,
                      marginBottom: 0,
                      lineHeight: 1.5
                    }}
                  >
                    Alta, baja y roles de seguridad del personal disponible en el sistema.
                  </p>
                </div>

                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    background: "#ffffff",
                    border: `1px solid ${t.border}`,
                    color: t.title,
                    fontWeight: 900,
                    fontSize: 13
                  }}
                >
                  {ops.length} operadores
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginBottom: 20,
                  padding: 14,
                  borderRadius: 18,
                  background: "rgba(248, 250, 252, 0.72)",
                  border: `1px solid ${t.border}`,
                  flexWrap: "wrap"
                }}
              >
                <input
                  id="newOpN"
                  placeholder="Nombre del operador..."
                  style={{
                    flex: "1 1 220px",
                    padding: "11px 12px",
                    borderRadius: 14,
                    border: `1px solid ${t.border}`,
                    background: "#ffffff",
                    color: t.text,
                    fontWeight: 700
                  }}
                />

                <button
                  onClick={() => {
                    const n = document.getElementById("newOpN").value;
                    if (n) {
                      saveOps([
                        ...ops,
                        {
                          id: Date.now(),
                          name: n,
                          color: "#" + Math.random().toString(16).slice(2, 8),
                          calendar: {},
                          securityRoles: []
                        }
                      ]);
                      document.getElementById("newOpN").value = "";
                    }
                  }}
                  style={{
                    padding: "11px 16px",
                    background: "rgba(8, 145, 118, 0.12)",
                    color: t.title,
                    border: "1px solid rgba(8, 145, 118, 0.26)",
                    borderRadius: 14,
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: 12
                  }}
                >
                  Añadir operador
                </button>
              </div>
                            <div
                style={{
                  display: "grid",
                  gap: 12
                }}
              >
                {ops.map(o => {
                  const selectedRoles = Array.isArray(o.securityRoles) ? o.securityRoles : [];

                  return (
                    <div
                      key={o.id}
                      style={{
                        padding: 16,
                        borderRadius: 18,
                        border: `1px solid ${t.border}`,
                        background: "#ffffff",
                        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 14
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                          <Av name={o.name} color={o.color} size={34} />

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 900,
                                color: t.title,
                                fontSize: 15,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              }}
                            >
                              {o.name}
                            </div>

                            <div style={{ color: t.sub, fontSize: 12, fontWeight: 700, marginTop: 3 }}>
                              {selectedRoles.length} roles de seguridad
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => saveOps(ops.filter(x => x.id !== o.id))}
                          title="Eliminar operador"
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 12,
                            color: "#dc2626",
                            border: "1px solid rgba(239, 68, 68, 0.20)",
                            background: "rgba(239, 68, 68, 0.08)",
                            cursor: "pointer",
                            fontSize: 18,
                            fontWeight: 900,
                            lineHeight: 1
                          }}
                        >
                          ×
                        </button>
                      </div>

                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            color: t.sub,
                            marginBottom: 9,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            fontWeight: 900
                          }}
                        >
                          Roles de seguridad
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap"
                          }}
                        >
                          {SECURITY_ROLES.map(role => {
                            const active = selectedRoles.includes(role.id);

                            return (
                              <button
                                key={role.id}
                                type="button"
                                onClick={() => toggleSecurityRole(o.id, role.id)}
                                style={{
                                  padding: "8px 11px",
                                  borderRadius: 999,
                                  border: `1px solid ${active ? "rgba(8, 145, 118, 0.35)" : t.border}`,
                                  background: active ? "rgba(8, 145, 118, 0.12)" : "rgba(248, 250, 252, 0.95)",
                                  color: active ? t.title : t.sub,
                                  cursor: "pointer",
                                  fontSize: 11,
                                  fontWeight: 900,
                                  boxShadow: active ? "0 6px 14px rgba(15, 23, 42, 0.06)" : "none"
                                }}
                              >
                                {role.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            

                          {isAdmin && (
              <div
                className="glass-panel section-card"
                style={{
                  padding: 24,
                  borderRadius: 24
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 14,
                    marginBottom: 18,
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.10em",
                        color: t.accent,
                        marginBottom: 8,
                        fontWeight: 900
                      }}
                    >
                      Seguridad de acceso
                    </div>

                    <h3 style={{ color: t.title, margin: 0, fontSize: 24 }}>
                      Gestión de accesos
                    </h3>

                    <p
                      style={{
                        color: t.sub,
                        fontSize: 14,
                        marginTop: 7,
                        marginBottom: 0,
                        lineHeight: 1.5
                      }}
                    >
                      Creación y retirada de usuarios con permisos administrativos o de edición.
                    </p>
                  </div>

                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 999,
                      background: "#ffffff",
                      border: `1px solid ${t.border}`,
                      color: t.title,
                      fontWeight: 900,
                      fontSize: 13
                    }}
                  >
                    {admins.length} usuarios
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    marginBottom: 20,
                    padding: 14,
                    borderRadius: 18,
                    background: "rgba(248, 250, 252, 0.72)",
                    border: `1px solid ${t.border}`
                  }}
                >
                  <input
                    id="newU"
                    placeholder="Usuario"
                    style={{
                      padding: "11px 12px",
                      borderRadius: 14,
                      border: `1px solid ${t.border}`,
                      background: "#ffffff",
                      color: t.text,
                      fontWeight: 700
                    }}
                  />

                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    <input
                      id="newP"
                      type={showConfigPass ? "text" : "password"}
                      placeholder="Contraseña"
                      style={{
                        flex: 1,
                        padding: "11px 42px 11px 12px",
                        borderRadius: 14,
                        border: `1px solid ${t.border}`,
                        background: "#ffffff",
                        color: t.text,
                        fontWeight: 700
                      }}
                    />

                    <button
                      onClick={() => setShowConfigPass(!showConfigPass)}
                      style={{
                        position: "absolute",
                        right: 11,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex"
                      }}
                    >
                      <EyeIcon visible={showConfigPass} color={t.sub} />
                    </button>
                  </div>

                  <select
                    id="newR"
                    style={{
                      padding: "11px 12px",
                      borderRadius: 14,
                      border: `1px solid ${t.border}`,
                      background: "#ffffff",
                      color: t.text,
                      fontWeight: 800
                    }}
                  >
                    <option value="admin">Administrador</option>
                    <option value="editor">Editor</option>
                  </select>

                  <button
                    onClick={() => {
                      const u = document.getElementById("newU").value;
                      const p = document.getElementById("newP").value;
                      const r = document.getElementById("newR").value;

                      if (u && p) {
                        saveAdmins([
                          ...admins,
                          {
                            user: u,
                            passHash: simpleHash(p),
                            role: r
                          }
                        ]);

                        document.getElementById("newU").value = "";
                        document.getElementById("newP").value = "";
                      }
                    }}
                    style={{
                      padding: "11px 16px",
                      background: "rgba(8, 145, 118, 0.12)",
                      color: t.title,
                      border: "1px solid rgba(8, 145, 118, 0.26)",
                      borderRadius: 14,
                      fontWeight: 900,
                      cursor: "pointer",
                      fontSize: 12
                    }}
                  >
                    Crear usuario
                  </button>
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {admins.map(a => (
                    <div
                      key={a.user}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 13px",
                        borderRadius: 15,
                        background: "#ffffff",
                        border: `1px solid ${t.border}`,
                        fontSize: 13
                      }}
                    >
                      <div>
                        <div style={{ color: t.title, fontWeight: 900 }}>
                          {a.user}
                        </div>

                        <div
                          style={{
                            marginTop: 3,
                            color: t.sub,
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em"
                          }}
                        >
                          {a.role}
                        </div>
                      </div>

                      {a.role !== "superadmin" && (
                        <button
                          onClick={() => saveAdmins(admins.filter(x => x.user !== a.user))}
                          title="Eliminar usuario"
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 12,
                            color: "#dc2626",
                            border: "1px solid rgba(239, 68, 68, 0.20)",
                            background: "rgba(239, 68, 68, 0.08)",
                            cursor: "pointer",
                            fontSize: 18,
                            fontWeight: 900,
                            lineHeight: 1
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
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
        <div
      className="glass-panel section-card"
      style={{
        padding: 24,
        borderRadius: 24
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 22
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: t.accent,
              marginBottom: 8,
              fontWeight: 900
            }}
          >
            Personal
          </div>

          <h3
            style={{
              margin: 0,
              color: t.title,
              fontSize: 30,
              letterSpacing: "-0.03em",
              lineHeight: 1.05
            }}
          >
            Editor de ausencias
          </h3>

          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              color: t.sub,
              fontSize: 14,
              lineHeight: 1.5
            }}
          >
            Selecciona un operador y marca vacaciones, entrenamiento o baja sin afectar a la lógica base del calendario.
          </p>
        </div>

        {!canEdit && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.22)",
              color: "#dc2626",
              fontSize: 12,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.06em"
            }}
          >
            Modo lectura
          </div>
        )}
      </div>
            <div
        style={{
          padding: 16,
          borderRadius: 20,
          background: "rgba(248, 250, 252, 0.72)",
          border: `1px solid ${t.border}`,
          marginBottom: 18
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: t.sub,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 9
          }}
        >
          Operador seleccionado
        </div>

        <select
          value={selOp}
          onChange={e => setSelOp(Number(e.target.value))}
          style={{
            padding: "11px 12px",
            width: "100%",
            background: "#ffffff",
            color: t.text,
            border: `1px solid ${t.border}`,
            borderRadius: 14,
            fontWeight: 800
          }}
        >
          {ops.map(o => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        {ops.find(o => o.id === selOp) && (
          <div
            style={{
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 14,
              background: "#ffffff",
              border: `1px solid ${t.border}`
            }}
          >
            <Av
              name={ops.find(o => o.id === selOp)?.name}
              color={ops.find(o => o.id === selOp)?.color}
              size={30}
            />

            <div>
              <div style={{ color: t.title, fontWeight: 900, fontSize: 14 }}>
                {ops.find(o => o.id === selOp)?.name}
              </div>

              <div style={{ color: t.sub, fontSize: 12, fontWeight: 700 }}>
                Calendario {activeYear}
              </div>
            </div>
          </div>
        )}
      </div>
           <div
        style={{
          padding: 16,
          borderRadius: 20,
          background: "rgba(248, 250, 252, 0.72)",
          border: `1px solid ${t.border}`,
          marginBottom: 20
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: t.sub,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 10
          }}
        >
          Tipo de ausencia
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.keys(ABSENCE).map(k => {
            const active = selAb === k;

            return (
              <button
                key={k}
                onClick={() => setSelAb(k)}
                style={{
                  background: active ? ABSENCE[k].color : "#ffffff",
                  border: `1px solid ${active ? ABSENCE[k].color : t.border}`,
                  color: active ? "#111827" : t.title,
                  padding: "10px 14px",
                  borderRadius: 14,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 12,
                  boxShadow: active ? "0 8px 18px rgba(15, 23, 42, 0.08)" : "none"
                }}
              >
                {ABSENCE[k].icon} {ABSENCE[k].label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 14,
            background: "#ffffff",
            border: `1px solid ${t.border}`,
            color: t.sub,
            fontSize: 13,
            fontWeight: 700
          }}
        >
          Marcando ahora:{" "}
          <strong style={{ color: t.title }}>
            {ABSENCE[selAb]?.label || selAb}
          </strong>
        </div>
      </div>
            <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          gap: 15
        }}
      >
        {MONTHS.map((m, mi) => {
          const currentOp = ops.find(o => o.id === selOp);
          const monthAbsences = Array.from({ length: dim(activeYear, mi) }).filter((_, di) => {
            const k = mk(activeYear, mi + 1, di + 1);
            return Boolean(currentOp?.calendar?.[k]);
          }).length;

          return (
            <div
              key={m}
              style={{
                background: "#ffffff",
                padding: 15,
                borderRadius: 20,
                border: `1px solid ${t.border}`,
                boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: t.title,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em"
                  }}
                >
                  {m}
                </div>

                <span
                  style={{
                    padding: "5px 8px",
                    borderRadius: 999,
                    background: monthAbsences > 0
                      ? "rgba(8, 145, 118, 0.10)"
                      : "rgba(100, 116, 139, 0.10)",
                    color: monthAbsences > 0 ? "#15803d" : "#475569",
                    fontSize: 10,
                    fontWeight: 900
                  }}
                >
                  {monthAbsences} aus.
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 5
                }}
              >
                {Array.from({ length: dim(activeYear, mi) }).map((_, di) => {
                  const k = mk(activeYear, mi + 1, di + 1);
                  const status = currentOp?.calendar?.[k];
                  const rot = cshift(activeYear, mi, di + 1, off);
                  const absenceDef = status ? ABSENCE[status] : null;

                  return (
                    <div
                      key={di}
                      onClick={() => toggleAbsence(k)}
                      title={status ? absenceDef?.label : TURNO_DEF[rot]?.label}
                      style={{
                        height: 34,
                        background: status ? absenceDef?.color : "rgba(248, 250, 252, 0.95)",
                        border: `1px solid ${status ? "rgba(15, 23, 42, 0.10)" : "rgba(226, 232, 240, 0.90)"}`,
                        borderBottom: `3px solid ${TURNO_DEF[rot]?.color || "transparent"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        cursor: canEdit ? "pointer" : "default",
                        borderRadius: 8,
                        color: status ? "#111827" : t.text,
                        fontWeight: status ? 900 : 700
                      }}
                    >
                      {di + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


