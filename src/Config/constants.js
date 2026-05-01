export const THEMES = {
  dark: {
    bg: "#08111f",
    shell: "#0b1628",
    card: "rgba(13, 21, 38, 0.82)",
    cardSolid: "#0d1526",
    text: "#d7e3f4",
    title: "#ffffff",
    border: "rgba(90, 116, 148, 0.22)",
    sub: "#7f93ae",
    accent: "#39c89a",
    accentSoft: "rgba(57, 200, 154, 0.14)",
    dangerSoft: "rgba(239, 68, 68, 0.14)"
  },
  light: {
    bg: "#eef4fb",
    shell: "#f8fbff",
    card: "rgba(255, 255, 255, 0.9)",
    cardSolid: "#ffffff",
    text: "#334155",
    title: "#0f172a",
    border: "rgba(148, 163, 184, 0.28)",
    sub: "#64748b",
    accent: "#0f9f78",
    accentSoft: "rgba(15, 159, 120, 0.12)",
    dangerSoft: "rgba(239, 68, 68, 0.12)"
  }
};

export const CYCLE = [
  ["M", "M", "D", "D", "N", "N", "N"],
  ["D", "D", "M", "M", "D", "D", "D"],
  ["N", "N", "D", "D", "M", "M", "M"],
  ["D", "D", "N", "N", "D", "D", "D"],
];

export const CYCLE_LEN = 28;

export const ABSENCE = {
  VA: { label: "Vacaciones", icon: "🌴", color: "#10B981" },
  EN: { label: "Entrenamiento", icon: "📖", color: "#A78BFA" },
  BA: { label: "Baja", icon: "🤒", color: "#F87171" }
};

export const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const DOW_S = ["L", "M", "X", "J", "V", "S", "D"];

export const TURNO_DEF = {
  M: { color: "#F59E0B", label: "Mañana", bg: "#F59E0B15" },
  N: { color: "#818CF8", label: "Noche", bg: "#818CF815" },
  D: { color: "#64748B", label: "Descanso", bg: "transparent" }
};

export const EXTRA_VISUALS = {
  SC: { color: "#34D399", bg: "#34D39925" },
  CA: { color: "#475569", bg: "transparent" }
};
