export const Av = ({ name, color, size = 24 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 8,
      background: color || "#334155",
      display: "inline-grid",
      placeItems: "center",
      color: "white",
      fontWeight: 800,
      fontSize: Math.max(10, Math.floor(size * 0.42)),
      flex: "0 0 auto"
    }}
  >
    {name?.substring(0, 2).toUpperCase() || "?"}
  </div>
);