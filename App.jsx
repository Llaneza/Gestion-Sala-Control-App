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

      summary.totalDays += 1;

      if (missingCount === 0) {
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
    <LoginScreenComponent
      admins={admins}
      onLogin={(newSession) => {
        setSession(newSession);
        setView("daily");
      }}
      theme={t}
    />
  );
}

  return (
    <div style={{
      minHeight: "100vh",
      background: `radial-gradient(circle at top left, ${t.accentSoft}, transparent 32%), radial-gradient(circle at top right, rgba(99, 102, 241, 0.10), transparent 24%), linear-gradient(180deg, ${t.shell} 0%, ${t.bg} 55%, ${t.bg} 100%)`,
      color: t.text,
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      transition: 'background 0.3s'
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
        .glass-panel { background: ${t.card}; border: 1px solid ${t.border}; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .hero-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 24px; }
        .hero-card { border-radius: 22px; padding: 22px; }
        .hero-title { font-size: 28px; font-weight: 800; color: ${t.title}; margin: 0 0 8px; letter-spacing: -0.02em; }
        .hero-sub { color: ${t.sub}; font-size: 14px; line-height: 1.5; margin: 0; }
        .hero-kpi-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${t.sub}; margin-bottom: 8px; }
        .hero-kpi-value { font-size: 28px; font-weight: 800; color: ${t.title}; }
        .section-card { border-radius: 20px; }
        .calendar-container { background: ${t.card}; border-radius: 20px; overflow-x: auto; border: 1px solid ${t.border}; margin-bottom: 40px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.12); position: relative; -webkit-overflow-scrolling: touch; }
        .calendar-grid { display: grid; grid-template-columns: 140px repeat(${dim(activeYear, month)}, minmax(46px, 1fr)); gap: 0px; width: max-content; min-width: 100%; }
        @media (min-width: 1024px) { .calendar-grid { width: 100%; grid-template-columns: 150px repeat(${dim(activeYear, month)}, 1fr); } .cell-day { min-width: 0 !important; } }
        @media (max-width: 980px) { .hero-grid { grid-template-columns: 1fr; } }
        .sticky-col { position: sticky; left: 0; background: ${t.cardSolid} !important; z-index: 50; border-right: 1px solid ${t.border} !important; box-sizing: border-box; }
        .cell-day { height: 40px; display: flex; align-items: center; justify-content: center; border-top: 1px solid ${t.border}; border-right: 1px solid ${t.border}; font-size: 11px; box-sizing: border-box; }
        .header-day { height: 58px !important; flex-direction: column; gap: 2px; background: ${t.shell} !important; }
        .soft-button { background: ${t.card}; color: ${t.text}; border: 1px solid ${t.border}; border-radius: 12px; padding: 10px 14px; cursor: pointer; fontSize: 12px; }
        .soft-input { width: 100%; border-radius: 12px; border: 1px solid ${t.border}; background: ${t.shell}; color: ${t.text}; }
        .print-only { display: none; }
      `}</style>

      <header className="no-print glass-panel" style={{ margin: '14px 14px 0', padding: "14px 18px", display: 'flex', justifyContent: 'space-between', borderRadius: 22, alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          
        
          <select value={activeYear} onChange={e => setAY(Number(e.target.value))} style={{ background: t.shell, color: t.text, border: `1px solid ${t.border}`, borderRadius: 12, padding: '9px 12px', fontSize: 13, minWidth: 110 }}>
            {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ padding: '10px 14px', borderRadius: 14, background: t.shell, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 11, color: t.sub, marginBottom: 3 }}>Sesión activa</div>
<div style={{ fontSize: 13, fontWeight: 700, color: t.title }}>{sessionDisplayRole || sessionDisplayName}</div>
          </div>
          <button onClick={() => setSession(null)} style={{ background: t.dangerSoft, color: '#EF4444', border: `1px solid rgba(239, 68, 68, 0.24)`, padding: '10px 14px', borderRadius: 12, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>Cerrar sesión</button>
        </div>
      </header>

      <nav className="no-print glass-panel" style={{ display: 'flex', margin: '14px 14px 0', padding: 8, borderRadius: 18, justifyContent: 'center' }}>
        <div style={{ display: 'flex', width: '100%', maxWidth: 820, gap: 8, flexWrap: 'wrap' }}>
          {["daily","calendar", "security", "stats", canSeeEditor && "editor", isAdmin && "config"].filter(Boolean).map(v => {
  const labels = {
  daily: "Operativa diaria",  
  calendar: "Calendario DCS",
  security: "Calendario Seguridad",
  stats: "Estadísticas",
  editor: "Personal",
  config: "Administración"
};
  return (
    <button
      key={v}
      onClick={() => setView(v)}
      style={{
        flex: 1,
        padding: '13px 12px',
        color: view === v ? t.title : t.sub,
        background: view === v ? t.accentSoft : 'transparent',
        border: `1px solid ${view === v ? t.border : 'transparent'}`,
        cursor: 'pointer',
        fontWeight: 'bold',
        borderRadius: 12,
        fontSize: 12
      }}
    >
      {labels[v]}
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
    <div
      style={{
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: t.accent,
        marginBottom: 10,
        fontWeight: 800
      }}
    >
      Operativa diaria
    </div>

    <h1 style={{ margin: 0, color: t.title, fontSize: 34 }}>
      Resumen del día
    </h1>

    <p style={{ marginTop: 8, marginBottom: 0, color: t.sub, fontSize: 15 }}>
      Vista rápida de los puestos asignados hoy.
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
    <div style={{ fontSize: 18 }}>
      {today.getDate()}/{today.getMonth() + 1}/{today.getFullYear()}
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
   {dailySummary.map(({ title, value }) => (
  <div
    key={title}
    style={{
      background: t.shell,
      border: `1px solid ${t.border}`,
      borderRadius: 18,
      padding: 20,
      minHeight: 120
    }}
  >
    <div
      style={{
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: t.sub,
        marginBottom: 12,
        fontWeight: 800
      }}
    >
      {title}
    </div>

    <div style={{ fontSize: 22, fontWeight: 800, color: t.title }}>
      {value}
    </div>
  </div>
))}
</div>

<div
  style={{
    marginTop: 24,
    paddingTop: 22,
    borderTop: `1px solid ${t.border}`
  }}
>
  <h2 style={{ margin: 0, color: t.title, fontSize: 22 }}>
    Ausencias de hoy
  </h2>

  <p style={{ marginTop: 6, marginBottom: 16, color: t.sub, fontSize: 14 }}>
    Personal con vacaciones, entrenamiento o baja en el día actual.
  </p>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 12
    }}
  >
    {todayAbsences.length > 0 ? (
      todayAbsences.map(op => {
        const code = op.calendar?.[todayKey];

        const label =
          code === "VA"
            ? "Vacaciones"
            : code === "EN"
            ? "Entrenamiento"
            : code === "BA"
            ? "Baja"
            : code;

        return (
          <div
            key={op.id}
            style={{
              background: t.shell,
              border: `1px solid ${t.border}`,
              borderRadius: 18,
              padding: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Av name={op.name} color={op.color} size={28} />
              <div>
                <div style={{ fontWeight: 800, color: t.title }}>
                  {op.name}
                </div>
                <div style={{ fontSize: 13, color: t.sub }}>
                  {label}
                </div>
              </div>
            </div>

            <strong
              style={{
                color:
                  code === "VA"
                    ? "#059669"
                    : code === "EN"
                    ? "#6366f1"
                    : "#ef4444"
              }}
            >
              {code}
            </strong>
          </div>
        );
      })
    ) : (
      <div
        style={{
          background: t.shell,
          border: `1px solid ${t.border}`,
          borderRadius: 18,
          padding: 18,
          color: t.sub,
          fontSize: 14
        }}
      >
        No hay ausencias registradas hoy.
      </div>
    )}
  </div>
</div>
  </div>
)}
        {view === "calendar" && (
          <div>
            <div className="glass-panel section-card no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 20, alignItems: 'center', padding: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.sub, marginBottom: 6 }}>Calendario operativo</div>
                <h2 style={{ margin: 0, minWidth: 120, textAlign: 'center', fontSize: 24, color: t.title, letterSpacing: '-0.02em' }}>{currentMonthLabel}</h2>
                {isAdmin && (
  <button
    onClick={handleRecalculatePlan}
    disabled={isRecalculating}
    style={{
      marginTop: 12,
      padding: '10px 14px',
      borderRadius: 12,
      border: `1px solid ${planHasPendingChanges || !hasSavedPlan ? 'rgba(245, 158, 11, 0.55)' : t.border}`,
      background: planHasPendingChanges || !hasSavedPlan ? 'rgba(245, 158, 11, 0.16)' : t.accentSoft,
      color: t.title,
      cursor: isRecalculating ? 'not-allowed' : 'pointer',
      fontSize: 12,
      fontWeight: 800
    }}
  >
    {isRecalculating ? "Calculando..." : hasSavedPlan ? "Recalcular planificación" : "Generar planificación"}
  </button>
)}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text, cursor: 'pointer', fontSize: 12, fontWeight: 700 }} onClick={handlePrevMonth}>Mes anterior</button>
                <button style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.accentSoft, color: t.title, cursor: 'pointer', fontSize: 12, fontWeight: 700 }} onClick={handleNextMonth}>Mes siguiente</button>
                <select value={printMode} onChange={e => setPrintMode(e.target.value)} style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text, fontSize: 12, minWidth: 210 }}>
                  <option value="annual">Exportación anual completa</option>
                  <option value="individual">Calendario individual</option>
                </select>
                                {printMode === "individual" && (
                  <select value={printOpId} onChange={e => setPrintOpId(e.target.value)} style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text, fontSize: 12, minWidth: 220 }}>
                    {dcsOps.map(op => <option key={op.id} value={String(op.id)}>{op.name}</option>)}
                  </select>
                )}

               

                <button
                  style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.cardSolid, color: t.text, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
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
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                  padding: "16px 18px",
                  borderTop: `1px solid ${t.border}`,
                  color: t.sub,
                  fontSize: 12
                }}
              >
                {CALENDAR_LEGEND.map(item => (
                  <div
                    key={item.code}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      whiteSpace: "nowrap"
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 8,
                        border: `1px solid ${t.border}`,
                        background: item.color,
                        color: item.textColor,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 900
                      }}
                    >
                      {item.code}
                    </span>

                    <span>{item.label}</span>
                  </div>
                ))}
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
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: t.sub,
          marginBottom: 6
        }}
      >
        Calendario Seguridad
      </div>

      <h2 style={{ margin: 0, color: t.title }}>
        Roles de seguridad
      </h2>

      <p style={{ margin: "8px 0 0", color: t.sub, fontSize: 14 }}>
        Vista inicial para organizar Brigada, DCS, Coordinador de Emergencias y Conteo.
      </p>
      {isAdmin && (
  <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <button
      onClick={handleGenerateSecurityPlan}
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: `1px solid ${t.border}`,
        background: t.accentSoft,
        color: t.title,
        fontWeight: 900,
        cursor: "pointer"
      }}
    >
      {activeSecurityPlan ? "Regenerar planificación seguridad" : "Generar planificación seguridad"}
    </button>

    {activeSecurityPlan?.meta?.generatedAt && (
  <span style={{ color: t.sub, fontSize: 13 }}>
    Planificación generada para {activeYear} · {activeSecurityDaysCount} días creados
  </span>
)}
  </div>
)}
    </div>
{activeSecurityPlan?.days && (
  <div
    style={{
      marginTop: 26,
      border: `1px solid ${t.border}`,
      background: t.shell,
      borderRadius: 22,
      padding: 18
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginBottom: 16,
        flexWrap: "wrap"
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: t.sub,
            marginBottom: 4
          }}
        >
          Calendario mensual de seguridad
        </div>

        <h3 style={{ margin: 0, color: t.title, fontSize: 24 }}>
          {MONTHS[month]} {activeYear}
        </h3>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
      borderRadius: 12,
      border: `1px solid ${t.border}`,
      background: t.card,
      color: t.text,
      cursor: "pointer",
      fontWeight: 700
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
      borderRadius: 12,
      border: `1px solid ${t.border}`,
      background: t.accentSoft,
      color: t.title,
      cursor: "pointer",
      fontWeight: 800
    }}
  >
    Mes siguiente
  </button>
</div>
    </div>
<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    marginBottom: 16
  }}
>
  {[
    ["Días del mes", activeSecurityMonthSummary.totalDays],
    ["Días completos", activeSecurityMonthSummary.completeDays],
    ["Días con avisos", activeSecurityMonthSummary.warningDays],
    ["Puestos pendientes", activeSecurityMonthSummary.missingAssignments]
  ].map(([label, value]) => (
    <div
      key={label}
      style={{
        border: `1px solid ${t.border}`,
        background: t.card,
        borderRadius: 16,
        padding: 14
      }}
    >
      <div
        style={{
          color: t.sub,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
          fontWeight: 800
        }}
      >
        {label}
      </div>

      <div
        style={{
          color: t.title,
          fontSize: 24,
          fontWeight: 900
        }}
      >
        {value}
      </div>
    </div>
  ))}
</div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 10
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

        return (
          <div
            key={dateKey}
            style={{
              border: `1px solid ${isToday ? t.accent : t.border}`,
              background: isToday ? t.accentSoft : t.card,
              borderRadius: 16,
              padding: 12,
              boxShadow: isToday ? `inset 0 0 0 2px ${t.accent}` : undefined
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10
              }}
            >
              <strong style={{ color: t.title, fontSize: 16 }}>
                {dayNumber}
              </strong>

              <span style={{ color: t.sub, fontSize: 11 }}>
                {dayPlan.dateLabel || `${String(dayNumber).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${activeYear}`}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {roleRows.map(([roleId, label]) => {
                const operatorId = dayPlan?.[roleId];

                return (
                  <div
                    key={roleId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 12,
                      color: t.text
                    }}
                  >
                    <span style={{ color: t.sub }}>
                      {label}
                    </span>

                    <strong
                      style={{
                        color: operatorId ? t.title : t.sub,
                        textAlign: "right"
                      }}
                    >
                      {operatorId ? getOperatorNameById(operatorId) : "—"}
                    </strong>
                  </div>
                );
              })}
            </div>

            {dayPlan.warnings?.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  color: "#ef4444",
                  fontSize: 11,
                  fontWeight: 800
                }}
              >
                {dayPlan.warnings.length} aviso/s
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
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
              background: t.shell,
              borderRadius: 18,
              padding: 16
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: t.title,
                marginBottom: 10
              }}
            >
              {role.label}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roleOps.length > 0 ? (
                roleOps.map(op => (
                  <div
                    key={op.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: t.text,
                      fontSize: 13
                    }}
                  >
                    <Av name={op.name} color={op.color} size={24} />
                    <span>{op.name}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: t.sub, fontSize: 13 }}>
                  Sin operadores asignados
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
{activeSecurityPlan?.counters && (
  <div
    style={{
      marginTop: 18,
      borderTop: `1px solid ${t.border}`,
      paddingTop: 18
    }}
  >
    <h3 style={{ margin: "0 0 12px", color: t.title, fontSize: 16 }}>
      Reparto de seguridad
    </h3>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14
      }}
    >
      {[
  ["DCS", "DCS seguridad"],
  ["BRIGADA", "Brigada"],
  ["COORDINADOR_EMERGENCIAS", "Coordinador Emergencias"],
  ["CONTEO", "Conteo"]
].map(([roleId, title]) => (
        <div
          key={roleId}
          style={{
            border: `1px solid ${t.border}`,
            background: t.shell,
            borderRadius: 16,
            padding: 14
          }}
        >
          <h4 style={{ margin: "0 0 10px", color: t.title, fontSize: 14 }}>
            {title}
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(activeSecurityPlan.counters?.[roleId] || {}).length > 0 ? (
              Object.entries(activeSecurityPlan.counters?.[roleId] || {}).map(([operatorId, count]) => (
                <div
                  key={operatorId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    color: t.text,
                    fontSize: 13
                  }}
                >
                  <span>{getOperatorNameById(operatorId)}</span>
                  <strong style={{ color: t.title }}>{count}</strong>
                </div>
              ))
            ) : (
              <span style={{ color: t.sub, fontSize: 13 }}>
                Sin asignaciones
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)}
  </div>
)}
        {view === "stats" && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {stats.sort((a,b) => b.nSC - a.nSC || b.hSC - a.hSC).map(s => (
              <div key={s.id} className="glass-panel section-card" style={{ padding: 25 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}><Av name={s.name} color={s.color} size={36} /><div><div style={{ fontWeight: 'bold', color: t.title, fontSize: 18 }}>{s.name}</div><div style={{ fontSize: 12, color: t.sub }}>Resumen anual de servicio</div></div></div>
                <div style={{ fontSize: 34, fontWeight: 800, color: t.title, marginBottom: 6 }}>{s.sc} SC</div>
                <div style={{ fontSize: 14, color: t.sub, marginBottom: 16 }}>{s.hSC} horas totales asignadas</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', paddingTop: 14, borderTop: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 12, color: t.sub }}>Noches</span>
                  <strong style={{ color: t.accent, fontSize: 18 }}>{s.nSC}</strong>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "editor" && <EditorComponent ops={ops} saveOps={saveOps} activeYear={activeYear} theme={t} off={off} canEdit={canEdit} />}

        {view === "config" && isAdmin && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
            <div className="glass-panel section-card" style={{ padding: 25 }}>
              <h3 style={{ color: t.title, marginTop: 0 }}>OPERADORES</h3>
              <p style={{ color: t.sub, fontSize: 13, marginTop: 0, marginBottom: 18 }}>Alta y baja de personal operativo disponible en el sistema.</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <input id="newOpN" placeholder="Nombre..." style={{ flex: 1, padding: 12, borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
               <button onClick={() => { const n = document.getElementById('newOpN').value; if(n) { saveOps([...ops, { id: Date.now(), name: n, color: '#'+Math.random().toString(16).slice(2,8), calendar: {}, securityRoles: [] }]); document.getElementById('newOpN').value = ''; } }} style={{ padding: '0 20px', background: t.accentSoft, color: t.title, border: `1px solid ${t.border}`, borderRadius: 12, fontWeight: 'bold', cursor: 'pointer' }}>AÑADIR</button>
              </div>
              {ops.map(o => {
  const selectedRoles = Array.isArray(o.securityRoles) ? o.securityRoles : [];

  return (
    <div
      key={o.id}
      style={{
        padding: "14px 0",
        borderTop: `1px solid ${t.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12
        }}
      >
        <span style={{ fontWeight: 700, color: t.title }}>{o.name}</span>

        <button
          onClick={() => saveOps(ops.filter(x => x.id !== o.id))}
          style={{
            color: "#EF4444",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 18
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
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 800
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
                  padding: "7px 10px",
                  borderRadius: 999,
                  border: `1px solid ${active ? t.accent : t.border}`,
                  background: active ? t.accentSoft : t.shell,
                  color: active ? t.title : t.sub,
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 800
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

            <div className="glass-panel section-card" style={{ padding: 25 }}>
              <h3 style={{ color: t.title, marginTop: 0 }}>OFFSET</h3>
              <p style={{ color: t.sub, fontSize: 13, marginTop: 0, marginBottom: 12 }}>Valor actual de desfase aplicado al ciclo base.</p>
              <div style={{ fontSize: 30, fontWeight: 800, color: t.accent, marginBottom: 16 }}>{off}</div>
              <input type="number" value={off} onChange={e => saveOff(Number(e.target.value))} style={{ padding: 12, width: '100%', borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
            </div>

             {isAdmin && (
              <div className="glass-panel section-card" style={{ padding: 25 }}>
              <h3 style={{ color: t.title, marginTop: 0 }}>GESTIÓN DE ACCESOS</h3>
                <p style={{ color: t.sub, fontSize: 13, marginTop: 0, marginBottom: 18 }}>Creación y retirada de usuarios con permisos administrativos o de edición.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  <input id="newU" placeholder="Usuario" style={{ padding: 10, borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input id="newP" type={showConfigPass ? "text" : "password"} placeholder="Contraseña" style={{ flex: 1, padding: 10, paddingRight: 40, borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }} />
                    <button onClick={() => setShowConfigPass(!showConfigPass)} style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><EyeIcon visible={showConfigPass} color={t.sub} /></button>
                  </div>
                  <select id="newR" style={{ padding: 10, borderRadius: 12, border: `1px solid ${t.border}`, background: t.shell, color: t.text }}><option value="admin">Administrador</option><option value="editor">Editor</option></select>
                  <button onClick={() => {
                    const u = document.getElementById('newU').value, p = document.getElementById('newP').value, r = document.getElementById('newR').value;
                    if(u && p) { saveAdmins([...admins, { user: u, passHash: simpleHash(p), role: r }]); document.getElementById('newU').value = ''; document.getElementById('newP').value = ''; }
                  }} style={{ padding: 12, background: t.accentSoft, color: t.title, border: `1px solid ${t.border}`, borderRadius: 12, fontWeight: 'bold', cursor: 'pointer' }}>CREAR</button>
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
    <div className="glass-panel section-card" style={{ padding: 25 }}>
      {!canEdit && <p style={{ color: '#EF4444', fontSize: 12, marginBottom: 15, fontWeight: 'bold' }}>MODO LECTURA</p>}
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 8px', color: t.title }}>Editor de ausencias</h3>
        <p style={{ margin: 0, color: t.sub, fontSize: 13 }}>Selecciona un operador y marca vacaciones, entrenamiento o baja sin afectar a la lógica base del calendario.</p>
      </div>
      <select value={selOp} onChange={e => setSelOp(Number(e.target.value))} style={{ padding: 12, width: '100%', background: t.shell, color: t.text, border: `1px solid ${t.border}`, borderRadius: 12, marginBottom: 20 }}>
        {ops.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.keys(ABSENCE).map(k => (
          <button key={k} onClick={() => setSelAb(k)} style={{ background: selAb === k ? ABSENCE[k].color : 'transparent', border: `2px solid ${ABSENCE[k].color}`, color: selAb === k ? '#000' : ABSENCE[k].color, padding: '10px 14px', borderRadius: 12, cursor: 'pointer', fontWeight: 'bold' }}>{ABSENCE[k].icon} {ABSENCE[k].label}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 15 }}>
        {MONTHS.map((m, mi) => (
          <div key={m} style={{ background: t.shell, padding: 14, borderRadius: 16, border: `1px solid ${t.border}` }}>
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


