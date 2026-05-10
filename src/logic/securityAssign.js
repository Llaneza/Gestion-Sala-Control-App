import { cshift } from "../utils/dateUtils.js";

const SECURITY_ROLE_IDS = {
  BRIGADA: "BRIGADA",
  DCS: "DCS",
  COORDINADOR_EMERGENCIAS: "COORDINADOR_EMERGENCIAS",
  CONTEO: "CONTEO"
};

const BLOCKING_ABSENCE_CODES = ["VA", "BA", "EN"];

const makeAppDateKey = (year, month, day) => {
  return `${year}-${month}-${day}`;
};

const formatEuropeanDate = (year, month, day) => {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
};

const hasSecurityRole = (operator, roleId) => {
  return Array.isArray(operator?.securityRoles) && operator.securityRoles.includes(roleId);
};

const getOperatorDayValue = (operator, dateKey) => {
  return operator?.calendar?.[dateKey] || "";
};

const isBlockedByAbsence = (operator, dateKey) => {
  const dayValue = getOperatorDayValue(operator, dateKey);
  return BLOCKING_ABSENCE_CODES.includes(dayValue);
};

const isOperatorWorking = ({ operator, dateKey, shiftCode }) => {
  if (isBlockedByAbsence(operator, dateKey)) {
    return false;
  }

  return Boolean(shiftCode) && shiftCode !== "D";
};
const getDcsOperatorsForDay = ({ operators, dateKey, dcsPlan }) => {
  const dcsDayAssignments = dcsPlan?.[dateKey] || {};

  return operators.filter(operator => {
    const operatorAssignment = dcsDayAssignments?.[operator.id];

    return (
      operatorAssignment === "SC" &&
      hasSecurityRole(operator, SECURITY_ROLE_IDS.DCS) &&
      !isBlockedByAbsence(operator, dateKey)
    );
  });
};

const pickLeastAssignedOperator = ({ candidates, roleId, counters, usedOperatorIds }) => {
  const availableCandidates = candidates.filter(operator => !usedOperatorIds.has(operator.id));

  if (availableCandidates.length === 0) {
    return null;
  }

  return [...availableCandidates].sort((a, b) => {
    const aCount = counters?.[roleId]?.[a.id] || 0;
    const bCount = counters?.[roleId]?.[b.id] || 0;

    if (aCount !== bCount) return aCount - bCount;

    return String(a.name || "").localeCompare(String(b.name || ""));
  })[0];
};

const getAvailableOperatorsByRole = ({ operators, dateKey, roleId, shiftCode }) => {
  return operators.filter(operator => {
    return (
      hasSecurityRole(operator, roleId) &&
      isOperatorWorking({ operator, dateKey, shiftCode })
    );
  });
};

const getDayOfYearIndex = ({ year, monthIndex, day }) => {
  const currentDate = Date.UTC(year, monthIndex, day);
  const firstDayOfYear = Date.UTC(year, 0, 1);

  return Math.floor((currentDate - firstDayOfYear) / 86400000);
};

const getSecurityBlockIndex = ({ year, monthIndex, day }) => {
  const dayOfYearIndex = getDayOfYearIndex({ year, monthIndex, day });

  return Math.floor(dayOfYearIndex / 15);
};

const FIXED_BRIGADA_ORDER = ["Pablo", "Carlos", "Manuga", "Toni"];

const FIXED_COORDINADOR_ORDER = ["Alejandro", "Claudia", "Rosa", "Kao", "Florentino"];

const normalizeOperatorName = name => {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const findOperatorByNameAndRole = ({ operators, name, roleId }) => {
  const normalizedName = normalizeOperatorName(name);

  return operators.find(operator => {
    return (
      normalizeOperatorName(operator?.name) === normalizedName &&
      hasSecurityRole(operator, roleId)
    );
  });
};

const getFixedOrderCandidatesForBlock = ({ operators, roleId, orderedNames, blockIndex }) => {
  if (!Array.isArray(orderedNames) || orderedNames.length === 0) {
    return [];
  }

  const startIndex = blockIndex % orderedNames.length;
  const orderedCycleNames = [
    ...orderedNames.slice(startIndex),
    ...orderedNames.slice(0, startIndex)
  ];

  return orderedCycleNames
    .map(name => findOperatorByNameAndRole({ operators, name, roleId }))
    .filter(Boolean);
};

const pickFirstAvailableFixedOrderOperator = ({ candidates, dateKey, usedOperatorIds }) => {
  return (
    candidates.find(operator => {
      return !isBlockedByAbsence(operator, dateKey) && !usedOperatorIds.has(operator.id);
    }) || null
  );
};

const getFixedOrderWarning = ({ roleLabel, candidates }) => {
  if (!candidates || candidates.length === 0) {
    return `Sin ${roleLabel} configurado`;
  }

  return `Sin ${roleLabel} disponible`;
};


export function generateSecurityPlan({ operators = [], year, dcsPlan = {}, off = 0 }) {
  if (!year) {
    return {};
  }

  const days = {};
  const counters = {
    BRIGADA: {},
    DCS: {},
    COORDINADOR_EMERGENCIAS: {},
    CONTEO: {}
  };

  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const monthNumber = monthIndex + 1;
      const dateKey = makeAppDateKey(year, monthNumber, day);
      const shiftCode = cshift(year, monthIndex, day, off);
      const blockIndex = getSecurityBlockIndex({ year, monthIndex, day });

      const usedOperatorIds = new Set();
      const warnings = [];

      const securityDay = {
        BRIGADA: null,
        DCS: null,
        COORDINADOR_EMERGENCIAS: null,
        CONTEO: null,
        warnings
      };
      if (shiftCode === "D") {
        days[dateKey] = {
          ...securityDay,
          dateLabel: formatEuropeanDate(year, monthNumber, day)
        };

        continue;
      }
            const brigadaCandidates = getFixedOrderCandidatesForBlock({
        operators,
        roleId: SECURITY_ROLE_IDS.BRIGADA,
        orderedNames: FIXED_BRIGADA_ORDER,
        blockIndex
      });

      const selectedBrigada = pickFirstAvailableFixedOrderOperator({
        candidates: brigadaCandidates,
        dateKey,
        usedOperatorIds
      });

      if (selectedBrigada) {
        securityDay.BRIGADA = selectedBrigada.id;
        usedOperatorIds.add(selectedBrigada.id);
        counters.BRIGADA[selectedBrigada.id] = (counters.BRIGADA[selectedBrigada.id] || 0) + 1;
      } else {
        warnings.push(
          getFixedOrderWarning({
            roleLabel: "Brigada",
            candidates: brigadaCandidates
          })
        );
      }

      const coordinadorCandidates = getFixedOrderCandidatesForBlock({
        operators,
        roleId: SECURITY_ROLE_IDS.COORDINADOR_EMERGENCIAS,
        orderedNames: FIXED_COORDINADOR_ORDER,
        blockIndex
      });

      const selectedCoordinador = pickFirstAvailableFixedOrderOperator({
        candidates: coordinadorCandidates,
        dateKey,
        usedOperatorIds
      });

      if (selectedCoordinador) {
        securityDay.COORDINADOR_EMERGENCIAS = selectedCoordinador.id;
        usedOperatorIds.add(selectedCoordinador.id);
        counters.COORDINADOR_EMERGENCIAS[selectedCoordinador.id] =
          (counters.COORDINADOR_EMERGENCIAS[selectedCoordinador.id] || 0) + 1;
      } else {
        warnings.push(
          getFixedOrderWarning({
            roleLabel: "Coordinador de Emergencias",
            candidates: coordinadorCandidates
          })
        );
      }

      const dcsCandidates = getDcsOperatorsForDay({
        operators,
        dateKey,
        dcsPlan
      });

      const selectedDcs = pickLeastAssignedOperator({
        candidates: dcsCandidates,
        roleId: SECURITY_ROLE_IDS.DCS,
        counters,
        usedOperatorIds
      });

      if (selectedDcs) {
        securityDay.DCS = selectedDcs.id;
        usedOperatorIds.add(selectedDcs.id);
        counters.DCS[selectedDcs.id] = (counters.DCS[selectedDcs.id] || 0) + 1;
      } else {
        warnings.push("Sin DCS disponible");
      }

      const conteoCandidates = getAvailableOperatorsByRole({
        operators,
        dateKey,
        roleId: SECURITY_ROLE_IDS.CONTEO,
        shiftCode
      });

      const selectedConteo = pickLeastAssignedOperator({
        candidates: conteoCandidates,
        roleId: SECURITY_ROLE_IDS.CONTEO,
        counters,
        usedOperatorIds
      });

      if (selectedConteo) {
        securityDay.CONTEO = selectedConteo.id;
        usedOperatorIds.add(selectedConteo.id);
        counters.CONTEO[selectedConteo.id] = (counters.CONTEO[selectedConteo.id] || 0) + 1;
      } else {
        warnings.push("Sin Conteo disponible");
      }

      days[dateKey] = {
        ...securityDay,
        dateLabel: formatEuropeanDate(year, monthNumber, day)
      };
    }
  }

  return {
    year,
    days,
    counters,
    meta: {
      generatedAt: new Date().toISOString(),
      status: "draft"
    }
  };
}

export {
  SECURITY_ROLE_IDS,
  hasSecurityRole,
  getAvailableOperatorsByRole
};