import BrandIcon from "./BrandIcon";
import StarButton from "../StarButton";
import { NPM_URL, SUPPORT_URL } from "@/lib/site";

export default function FinalCta() {
  return (
    <section
      style={{ maxWidth: "1160px", margin: "0 auto", padding: "0 24px 96px" }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "32px 48px",
          background: "#0d0d0d",
          border: "1px solid #242728",
          borderRadius: "12px",
          padding: "clamp(28px,5vw,56px)",
        }}
      >
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "44px",
              height: "44px",
              marginBottom: "20px",
              color: "#59d499",
              background: "#101111",
              border: "1px solid #242728",
              borderRadius: "10px",
            }}
          >
            <BrandIcon name="bell" size={24} />
          </span>
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: "clamp(26px,3.6vw,40px)",
              fontWeight: 600,
              letterSpacing: "-0.3px",
              color: "#f4f4f6",
            }}
          >
            Go make coffee. It&apos;ll ping you.
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "16px",
              lineHeight: 1.6,
              color: "#9c9c9d",
              maxWidth: "48ch",
            }}
          >
            Your agent runs for four minutes; you check the terminal forty
            times. Fix the second number.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            justifyItems: "start",
            gap: "12px",
          }}
        >
          <StarButton label="Star it on GitHub" placement="final_cta" />
          <a
            href={NPM_URL}
            className="hovBorder"
            style={{
              background: "#101111",
              border: "1px solid #242728",
              color: "#f4f4f6",
              fontSize: "14px",
              fontWeight: 500,
              padding: "10px 22px",
              borderRadius: "8px",
            }}
          >
            npm package
          </a>
          <a
            href={SUPPORT_URL}
            className="hovBorder"
            title="Support anotifier's development"
            style={{
              background: "#101111",
              border: "1px solid #3a2530",
              color: "#f4a6bd",
              fontSize: "14px",
              fontWeight: 500,
              padding: "10px 22px",
              borderRadius: "8px",
            }}
          >
            ♥ Support the project
          </a>
        </div>
      </div>
    </section>
  );
}
