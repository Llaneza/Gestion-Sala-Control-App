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

const getBlockLeadOperator = ({
  operators,
  roleId,
  blockIndex,
  excludedOperatorIds = new Set()
}) => {
  const roleOperators = operators.filter(operator => hasSecurityRole(operator, roleId));

  if (roleOperators.length === 0) {
    return null;
  }

  const preferredOperators = roleOperators.filter(
    operator => !excludedOperatorIds.has(operator.id)
  );

  const availableBlockOperators =
    preferredOperators.length > 0 ? preferredOperators : roleOperators;

  return availableBlockOperators[blockIndex % availableBlockOperators.length];
};

const pickFixedBlockLeadOperator = ({ blockLeadOperator, dateKey, usedOperatorIds }) => {
  if (!blockLeadOperator) {
    return null;
  }

  if (isBlockedByAbsence(blockLeadOperator, dateKey)) {
    return null;
  }

  if (usedOperatorIds.has(blockLeadOperator.id)) {
    return null;
  }

  return blockLeadOperator;
};

const getFixedBlockWarning = ({ roleLabel, blockLeadOperator, dateKey, usedOperatorIds }) => {
  if (!blockLeadOperator) {
    return `Sin ${roleLabel} disponible`;
  }

  if (isBlockedByAbsence(blockLeadOperator, dateKey)) {
    return `${roleLabel} sin asignar: titular ausente`;
  }

  if (usedOperatorIds.has(blockLeadOperator.id)) {
    return `${roleLabel} sin asignar: titular ya asignado en otro rol`;
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

      const brigadaBlockLead = getBlockLeadOperator({
        operators,
        roleId: SECURITY_ROLE_IDS.BRIGADA,
        blockIndex
      });

            const selectedBrigada = pickFixedBlockLeadOperator({
        blockLeadOperator: brigadaBlockLead,
        dateKey,
        usedOperatorIds
      });

      if (selectedBrigada) {
        securityDay.BRIGADA = selectedBrigada.id;
        usedOperatorIds.add(selectedBrigada.id);
        counters.BRIGADA[selectedBrigada.id] = (counters.BRIGADA[selectedBrigada.id] || 0) + 1;
      } else {
        warnings.push(
          getFixedBlockWarning({
            roleLabel: "Brigada",
            blockLeadOperator: brigadaBlockLead,
            dateKey,
            usedOperatorIds
          })
        );
      }

      const coordinadorBlockLead = getBlockLeadOperator({
        operators,
        roleId: SECURITY_ROLE_IDS.COORDINADOR_EMERGENCIAS,
        blockIndex,
        excludedOperatorIds: new Set(brigadaBlockLead ? [brigadaBlockLead.id] : [])
      });

           const selectedCoordinador = pickFixedBlockLeadOperator({
        blockLeadOperator: coordinadorBlockLead,
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
          getFixedBlockWarning({
            roleLabel: "Coordinador de Emergencias",
            blockLeadOperator: coordinadorBlockLead,
            dateKey,
            usedOperatorIds
          })
        );
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