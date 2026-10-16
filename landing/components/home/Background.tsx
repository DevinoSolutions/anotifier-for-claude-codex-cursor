export default function Background() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* A fixed height, so the glow does not move while the page streams in. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "900px",
          background:
            "radial-gradient(60% 60% at 22% 20%, rgba(89,212,153,0.08), transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "-10%",
          right: "-10%",
          top: 0,
          height: "760px",
          backgroundImage:
            "linear-gradient(rgba(89,212,153,0.065) 1px, transparent 1px), linear-gradient(90deg, rgba(89,212,153,0.065) 1px, transparent 1px)",
          backgroundSize: "58px 58px",
          transform: "perspective(420px) rotateX(64deg)",
          transformOrigin: "top center",
          animation: "gridScroll 7s linear infinite",
          maskImage: "linear-gradient(to bottom, #000 0%, transparent 72%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, #000 0%, transparent 72%)",
        }}
      />
    </div>
  );
}
