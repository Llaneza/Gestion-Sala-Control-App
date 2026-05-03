const SECURITY_ROLE_IDS = {
  BRIGADA: "BRIGADA",
  DCS: "DCS",
  COORDINADOR_EMERGENCIAS: "COORDINADOR_EMERGENCIAS",
  CONTEO: "CONTEO"
};

const BLOCKING_ABSENCE_CODES = ["VA", "BA", "EN"];

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

const isOperatorWorking = (operator, dateKey, dcsPlan) => {
  const dayValue = getOperatorDayValue(operator, dateKey);

  if (BLOCKING_ABSENCE_CODES.includes(dayValue)) {
    return false;
  }

  const dcsDayAssignments = dcsPlan?.[dateKey] || {};
  const operatorDcsValue = dcsDayAssignments?.[operator.id];

  return Boolean(operatorDcsValue);
};

const getAvailableOperatorsByRole = ({ operators, dateKey, roleId, dcsPlan }) => {
  return operators.filter(operator => {
    return (
      hasSecurityRole(operator, roleId) &&
      !isBlockedByAbsence(operator, dateKey) &&
      isOperatorWorking(operator, dateKey, dcsPlan)
    );
  });
};

/**
 * Genera la planificación de seguridad.
 *
 * IMPORTANTE:
 * Este algoritmo es independiente del algoritmo de Sala/DCS.
 * No modifica ni depende internamente de src/logic/autoAssign.js.
 *
 * Reglas previstas:
 * - Cada día debe tener 1 Brigada, 1 DCS, 1 Coordinador de Emergencias y 1 Conteo.
 * - Solo pueden asignarse operadores con el rol correspondiente.
 * - Solo cuentan operadores que estén trabajando ese día.
 * - Vacaciones, bajas y entrenamientos bloquean al operador.
 * - El DCS de seguridad debe salir de los operadores que estén en DCS ese día.
 * - Un operador no debe ocupar dos roles de seguridad el mismo día.
 * - El reparto debe ser lo más equitativo posible durante el año.
 */
export function generateSecurityPlan({ operators = [], year, dcsPlan = {} }) {
  if (!year) {
    return {};
  }

  const days = {};

  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      days[dateKey] = {
        BRIGADA: null,
        DCS: null,
        COORDINADOR_EMERGENCIAS: null,
        CONTEO: null,
        warnings: []
      };
    }
  }

  return {
    year,
    days,
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