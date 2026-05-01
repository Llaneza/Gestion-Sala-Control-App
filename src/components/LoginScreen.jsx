import { useState } from "react";
import { EyeIcon } from "./EyeIcon";
import { simpleHash } from "../utils/security";

export function LoginScreenComponent({ admins, onLogin, theme: t }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at top left, ${t.accentSoft}, transparent 32%), linear-gradient(180deg, ${t.shell} 0%, ${t.bg} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="glass-panel" style={{ padding: 40, borderRadius: 28, width: "100%", maxWidth: 430 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", color: t.accent, marginBottom: 10, textAlign: "center" }}>Acceso seguro</div>
          <h2 style={{ textAlign: "center", color: t.title, marginBottom: 10, marginTop: 0, fontSize: 30 }}>Sala de Control</h2>
          <p style={{ textAlign: "center", color: t.sub, margin: 0, fontSize: 14 }}>Accede al panel de turnos y gestión de personal.</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <input
            value={user}
            onChange={e => setUser(e.target.value)}
            placeholder="Usuario"
            style={{ padding: 14, borderRadius: 14, border: `1px solid ${t.border}`, background: t.shell, color: t.text }}
          />

          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type={showPass ? "text" : "password"}
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Contraseña"
              style={{ flex: 1, padding: 14, paddingRight: 45, borderRadius: 14, border: `1px solid ${t.border}`, background: t.shell, color: t.text }}
            />

            <button
              onClick={() => setShowPass(!showPass)}
              style={{ position: "absolute", right: 12, background: "none", border: "none", cursor: "pointer", display: "flex" }}
            >
              <EyeIcon visible={showPass} color={t.sub} />
            </button>
          </div>

          <button
            onClick={() => {
              const foundAdmin = admins.find(a => a.user === user && a.passHash === simpleHash(pass));

              if (foundAdmin) {
                onLogin(foundAdmin);
              } else {
                alert("Acceso denegado");
              }
            }}
            style={{ padding: 16, background: t.accentSoft, color: t.title, borderRadius: 14, border: `1px solid ${t.border}`, fontWeight: "bold", cursor: "pointer" }}
          >
            ENTRAR
          </button>

          <button
            onClick={() => onLogin({ role: "guest", user: "Invitado" })}
            style={{
              padding: "14px 16px",
              background: `linear-gradient(180deg, ${t.shell} 0%, ${t.bg} 100%)`,
              border: `1px solid ${t.border}`,
              borderRadius: 14,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              color: t.title,
              boxShadow: "0 8px 22px rgba(15, 23, 42, 0.06)"
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 800 }}>Modo lectura</span>
            <span style={{ fontSize: 12, color: t.sub }}>Acceso de consulta sin permisos de edición</span>
          </button>
        </div>
      </div>
    </div>
  );
}