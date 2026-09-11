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
      <div
        style={{
          position: "absolute",
          inset: "-15%",
          background:
            "radial-gradient(60% 50% at 22% 14%, rgba(89,212,153,0.09), transparent 60%), radial-gradient(55% 45% at 82% 42%, rgba(87,193,255,0.07), transparent 60%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "12%",
          top: "12%",
          width: "360px",
          height: "360px",
          borderRadius: "9999px",
          background:
            "radial-gradient(circle, rgba(89,212,153,0.20), transparent 68%)",
          filter: "blur(46px)",
          animation: "orbFloat1 20s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "8%",
          top: "44%",
          width: "320px",
          height: "320px",
          borderRadius: "9999px",
          background:
            "radial-gradient(circle, rgba(87,193,255,0.15), transparent 68%)",
          filter: "blur(52px)",
          animation: "orbFloat2 26s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "40%",
          top: "74%",
          width: "280px",
          height: "280px",
          borderRadius: "9999px",
          background:
            "radial-gradient(circle, rgba(89,212,153,0.12), transparent 70%)",
          filter: "blur(54px)",
          animation: "orbFloat3 30s ease-in-out infinite",
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
