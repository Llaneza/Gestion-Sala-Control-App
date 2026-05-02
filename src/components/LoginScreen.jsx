import { useState } from "react";
import { EyeIcon } from "./EyeIcon";
import { simpleHash } from "../utils/security";
import cortevaLogo from "../../Corteva_VerColor_RGB.png";

export function LoginScreenComponent({ admins, onLogin, theme: t }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  const isDarkTheme = t.title === "#ffffff";

  const handleAdminSubmit = (event) => {
    event.preventDefault();

    const foundAdmin = admins.find(
      a => a.user === user && a.passHash === simpleHash(pass)
    );

    if (foundAdmin) {
      onLogin(foundAdmin);
    } else {
      alert("Acceso denegado");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at top left, ${t.accentSoft}, transparent 32%), linear-gradient(180deg, ${t.shell} 0%, ${t.bg} 100%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20
      }}
    >
      <div
        className="glass-panel"
        style={{
          padding: 40,
          borderRadius: 28,
          width: "100%",
          maxWidth: 520
        }}
      >
        <div style={{ marginBottom: 34, textAlign: "center" }}>
<img
  src={cortevaLogo}
  alt="Corteva"
  style={{
    width: "280px",
    maxWidth: "78%",
    height: "auto",
    objectFit: "contain",
    marginBottom: 18,
    filter: isDarkTheme ? "brightness(0) invert(1)" : "none",
    transition: "filter 0.25s ease"
  }}
/>

          <h2
            style={{
              color: t.title,
              margin: 0,
              fontSize: 34,
              letterSpacing: "-0.03em"
            }}
          >
            Gestión De Personal
          </h2>
        </div>

        <button
          type="button"
          onClick={() => onLogin({ role: "guest", user: "Invitado" })}
          style={{
            width: "100%",
            padding: "22px 20px",
            background: `linear-gradient(180deg, ${t.shell} 0%, ${t.bg} 100%)`,
            border: `1px solid ${t.border}`,
            borderRadius: 18,
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: t.title,
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.06)",
            marginBottom: 30
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 900 }}>Modo lectura</span>
          <span style={{ fontSize: 13, color: t.sub }}>
            Acceso de consulta sin permisos de edición
          </span>
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 24
          }}
        >
          <div style={{ height: 1, flex: 1, background: t.border }} />
          <div
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: t.accent,
              fontWeight: 800,
              whiteSpace: "nowrap"
            }}
          >
            Acceso administrador
          </div>
          <div style={{ height: 1, flex: 1, background: t.border }} />
        </div>

        <form
          onSubmit={handleAdminSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 15 }}
        >
          <input
            value={user}
            onChange={e => setUser(e.target.value)}
            placeholder="Usuario"
            autoComplete="username"
            style={{
              padding: 14,
              borderRadius: 14,
              border: `1px solid ${t.border}`,
              background: t.shell,
              color: t.text
            }}
          />

          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              type={showPass ? "text" : "password"}
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              style={{
                flex: 1,
                padding: 14,
                paddingRight: 45,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                background: t.shell,
                color: t.text
              }}
            />

            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              style={{
                position: "absolute",
                right: 12,
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex"
              }}
            >
              <EyeIcon visible={showPass} color={t.sub} />
            </button>
          </div>

          <button
            type="submit"
            style={{
              padding: 16,
              background: t.accentSoft,
              color: t.title,
              borderRadius: 14,
              border: `1px solid ${t.border}`,
              fontWeight: "bold",
              cursor: "pointer"
            }}
          >
            ENTRAR
          </button>
        </form>
      </div>
    </div>
  );
}