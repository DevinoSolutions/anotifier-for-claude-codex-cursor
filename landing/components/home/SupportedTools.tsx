import Link from "next/link";

const GRID = "1.4fr 0.7fr 0.7fr 1fr 1.2fr";

const cards = [
  {
    icon: "claude",
    name: "Claude Code",
    where: "CLI + VS Code",
    href: "/claude-code/",
  },
  { icon: "codex", name: "Codex CLI", where: "CLI + VS Code", href: "/codex/" },
  { icon: "cursor", name: "Cursor", where: "VS Code native", href: "/cursor/" },
  { icon: "gemini", name: "Gemini CLI", where: "CLI", href: "/gemini-cli/" },
  { icon: "vscode", name: "VS Code", where: "agent mode", href: "/vscode/" },
];

type Cell = { check: boolean } | { text: string } | { dash: true };

const rows: { tool: string; cells: Cell[] }[] = [
  {
    tool: "Claude Code",
    cells: [
      { check: true },
      { check: true },
      { text: "Stop" },
      { text: "Notification" },
    ],
  },
  {
    tool: "Codex CLI",
    cells: [
      { check: true },
      { check: true },
      { text: "Stop" },
      { text: "PermissionRequest" },
    ],
  },
  {
    tool: "Cursor",
    cells: [{ check: true }, { dash: true }, { text: "stop" }, { dash: true }],
  },
  {
    tool: "Gemini CLI",
    cells: [
      { dash: true },
      { check: true },
      { text: "AfterAgent" },
      { text: "Notification" },
    ],
  },
];

const monoCell: React.CSSProperties = {
  fontFamily: "var(--font-mono-stack)",
  fontSize: "12px",
  color: "#cdcdcd",
};

function renderCell(cell: Cell, i: number) {
  if ("check" in cell)
    return (
      <span key={i} style={{ color: "#59d499" }}>
        ✓
      </span>
    );
  if ("dash" in cell)
    return (
      <span key={i} style={{ color: "#7d838a" }}>
        —
      </span>
    );
  return (
    <span key={i} style={monoCell}>
      {cell.text}
    </span>
  );
}

export default function SupportedTools() {
  return (
    <section
      style={{ maxWidth: "1160px", margin: "0 auto", padding: "0 24px 96px" }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono-stack)",
          fontSize: "13px",
          color: "#838a92",
          marginBottom: "10px",
        }}
      >
        [02] supported tools
      </div>
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: "clamp(26px,3.4vw,38px)",
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "#f4f4f6",
        }}
      >
        One config. Every agent.
      </h2>
      <p
        style={{
          margin: "0 0 32px",
          fontSize: "16px",
          lineHeight: 1.6,
          color: "#9c9c9d",
          maxWidth: "62ch",
        }}
      >
        The setup wizard detects what you have installed and wires each
        tool&apos;s native hook system — in the CLI and inside VS Code, no
        extension required.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: "16px",
        }}
      >
        {cards.map((c) => (
          <Link
            key={c.name}
            href={c.href}
            title={`${c.name} notifications — setup guide`}
            className="hovBorder"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "#0d0d0d",
              border: "1px solid #242728",
              borderRadius: "10px",
              padding: "16px",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                width: "48px",
                height: "48px",
                alignItems: "center",
                justifyContent: "center",
                background: "#f4f4f6",
                border: "1px solid #2a2d30",
                borderRadius: "8px",
                flex: "none",
              }}
            >
              <img
                src={`/assets/icons/${c.icon}.png`}
                alt={c.name}
                width="30"
                height="30"
              />
            </span>
            <div>
              <div
                style={{ fontSize: "15px", fontWeight: 500, color: "#f4f4f6" }}
              >
                {c.name}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono-stack)",
                  fontSize: "11px",
                  color: "#838a92",
                }}
              >
                {c.where}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div style={{ marginTop: "32px", overflowX: "auto" }}>
        <div
          style={{
            minWidth: "640px",
            border: "1px solid #242728",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              gap: "8px",
              padding: "12px 18px",
              background: "#0d0d0d",
              fontFamily: "var(--font-mono-stack)",
              fontSize: "11px",
              color: "#838a92",
              borderBottom: "1px solid #1a1b1e",
            }}
          >
            <span>tool</span>
            <span>vs code</span>
            <span>cli</span>
            <span>task complete</span>
            <span>needs input</span>
          </div>
          {rows.map((row, ri) => (
            <div
              key={row.tool}
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                gap: "8px",
                alignItems: "center",
                padding: "12px 18px",
                fontSize: "14px",
                borderBottom:
                  ri < rows.length - 1 ? "1px solid #17181b" : undefined,
              }}
            >
              <span style={{ color: "#f4f4f6", fontWeight: 500 }}>
                {row.tool}
              </span>
              {row.cells.map((cell, ci) => renderCell(cell, ci))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
