export default function handler(req, res) {
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

  return res.status(200).json({
    ok: true,
    canVacuum: false,
    reason: "API privada lista. Pendiente conectar calendario laboral de Alejandro y Claudia.",
    source: "gestion-personal",
    hidden: true
  });
}