// Utilidades básicas de seguridad y usuarios administradores iniciales.
// De momento mantenemos el comportamiento existente de la app.

export function simpleHash(str) {
  let h = 0x811c9dc5;

  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }

  return h.toString(16);
}

export const DEFAULT_ADMINS = [
  { user: "admin", passHash: simpleHash("admin1234"), role: "admin" }
];
