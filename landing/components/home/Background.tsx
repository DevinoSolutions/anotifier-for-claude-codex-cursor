// Orbs sit at a percentage of the page height. Placing them with top:N% moves
// them as the page grows while it loads (layout shift), so each lane is a
// full-height box pinned at top:0 and offset with a transform, which does not
// count as a shift.
const orbLane = (offset: string): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  transform: `translateY(${offset})`,
});

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
          // Same box as inset:-15% (130% of the parent, shifted back by 15% of
          // it), but placed with a transform: the parent grows while the page
          // loads and a percentage top/left edge would count as layout shift.
          top: 0,
          left: 0,
          width: "130%",
          height: "130%",
          transform: "translate(-11.5385%, -11.5385%)",
          background:
            "radial-gradient(60% 50% at 22% 14%, rgba(89,212,153,0.09), transparent 60%), radial-gradient(55% 45% at 82% 42%, rgba(87,193,255,0.07), transparent 60%)",
        }}
      />
      <div style={orbLane("12%")}>
        <div
          style={{
            position: "absolute",
            left: "12%",
            top: 0,
            width: "360px",
            height: "360px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(89,212,153,0.20), transparent 68%)",
            filter: "blur(46px)",
            animation: "orbFloat1 20s ease-in-out infinite",
          }}
        />
      </div>
      <div style={orbLane("44%")}>
        <div
          style={{
            position: "absolute",
            right: "8%",
            top: 0,
            width: "320px",
            height: "320px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(87,193,255,0.15), transparent 68%)",
            filter: "blur(52px)",
            animation: "orbFloat2 26s ease-in-out infinite",
          }}
        />
      </div>
      <div style={orbLane("74%")}>
        <div
          style={{
            position: "absolute",
            left: "40%",
            top: 0,
            width: "280px",
            height: "280px",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle, rgba(89,212,153,0.12), transparent 70%)",
            filter: "blur(54px)",
            animation: "orbFloat3 30s ease-in-out infinite",
          }}
        />
      </div>
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
