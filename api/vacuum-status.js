const CYCLE = [
  ["M", "M", "D", "D", "N", "N", "N"],
  ["D", "D", "M", "M", "D", "D", "D"],
  ["N", "N", "D", "D", "M", "M", "M"],
  ["D", "D", "N", "N", "D", "D", "D"]
];

const CYCLE_LEN = 28;

const ABSENCE_LABELS = {
  VA: "Vacaciones",
  EN: "Entrenamiento",
  BA: "Baja"
};

const normalizeName = name => {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

const getMadridDateParts = () => {
  const formatter = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  });

  const parts = formatter.formatToParts(new Date());
  const get = type => Number(parts.find(part => part.type === type)?.value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day")
  };
};

const daysSinceEpoch = (year, monthIndex, day) => {
  return Math.round(
    (new Date(year, monthIndex, day) - new Date(1970, 0, 1)) / 86400000
  );
};

const getShiftCode = (year, monthIndex, day, offset = 0) => {
  const pos = ((daysSinceEpoch(year, monthIndex, day) + offset) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN;
  return CYCLE[Math.floor(pos / 7)][pos % 7];
};

const makeDateKey = (year, month, day) => {
  return `${year}-${month}-${day}`;
};

const fetchFirebaseJson = async path => {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Firebase database URL is not configured");
  }

  const cleanUrl = databaseUrl.replace(/\/$/, "");
  const response = await fetch(`${cleanUrl}/${path}.json`);

  if (!response.ok) {
    throw new Error(`Firebase read failed: ${response.status}`);
  }

  return response.json();
};

const findOperatorByName = (operators, targetName) => {
  const normalizedTarget = normalizeName(targetName);

  return operators.find(operator => {
    return normalizeName(operator?.name) === normalizedTarget;
  });
};

const getOperatorStatusForDate = ({ operator, dateKey, shiftCode }) => {
  const absenceCode = operator?.calendar?.[dateKey] || null;
  const absenceLabel = absenceCode ? ABSENCE_LABELS[absenceCode] || absenceCode : null;
  const worksToday = shiftCode === "M" || shiftCode === "N";
  const availableForVacuum = worksToday && !absenceCode;

  return {
    name: operator?.name || null,
    found: Boolean(operator),
    shiftCode,
    shiftLabel:
      shiftCode === "M"
        ? "Mañana"
        : shiftCode === "N"
          ? "Noche"
          : "Descanso",
    worksToday,
    absence: absenceCode,
    absenceLabel,
    availableForVacuum
  };
};

export default async function handler(req, res) {
  const expectedToken = process.env.HA_VACUUM_TOKEN;

  const authHeader = req.headers.authorization || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "").trim()
    : null;

  const queryToken = req.query?.token || null;
  const receivedToken = bearerToken || queryToken;

  res.setHeader("Cache-Control", "no-store");

  if (!expectedToken) {
    return res.status(500).json({
      ok: false,
      error: "Server token is not configured"
    });
  }

  if (receivedToken !== expectedToken) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized"
    });
  }

  try {
    const [opsData, offsetData] = await Promise.all([
      fetchFirebaseJson("ops"),
      fetchFirebaseJson("offset")
    ]);

    const operators = Array.isArray(opsData)
      ? opsData
      : Object.values(opsData || {});

    const offset = Number(offsetData || 0);

    const { year, month, day } = getMadridDateParts();
    const monthIndex = month - 1;
    const dateKey = makeDateKey(year, month, day);
    const shiftCode = getShiftCode(year, monthIndex, day, offset);

    const alejandroOperator = findOperatorByName(operators, "Alejandro");
    const claudiaOperator = findOperatorByName(operators, "Claudia");

    const alejandro = getOperatorStatusForDate({
      operator: alejandroOperator,
      dateKey,
      shiftCode
    });

    const claudia = getOperatorStatusForDate({
      operator: claudiaOperator,
      dateKey,
      shiftCode
    });

    const canVacuum =
      alejandro.found &&
      claudia.found &&
      alejandro.availableForVacuum &&
      claudia.availableForVacuum;

    let reason = "Alejandro y Claudia están trabajando y sin ausencias.";

    if (!alejandro.found || !claudia.found) {
      reason = "No se ha encontrado a Alejandro o Claudia en la base de datos.";
    } else if (!alejandro.worksToday || !claudia.worksToday) {
      reason = "Alejandro o Claudia descansan hoy.";
    } else if (alejandro.absence || claudia.absence) {
      reason = "Alejandro o Claudia tienen una ausencia registrada hoy.";
    }

    return res.status(200).json({
      ok: true,
      canVacuum,
      reason,
      date: dateKey,
      shiftCode,
      alejandro,
      claudia,
      source: "gestion-personal",
      hidden: true,
      version: "vacuum-api-002"
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Vacuum status check failed",
      detail: error.message
    });
  }
}