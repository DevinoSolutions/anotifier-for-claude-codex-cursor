/** anotifier brand mark — "Prompt Wave": shell chevron emitting sound. */
export default function LogoMark({
  size = 32,
  tile = true,
}: {
  size?: number;
  tile?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      {tile && (
        <rect
          x="1"
          y="1"
          width="62"
          height="62"
          rx="14"
          fill="#0c1410"
          stroke="#1d3527"
          strokeWidth="2"
        />
      )}
      <path
        d="M13 20 L27 32 L13 44"
        fill="none"
        stroke="#f4f4f6"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M35 25 a9.5 9.5 0 0 1 0 14"
        fill="none"
        stroke="#59d499"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M41 19 a17 17 0 0 1 0 26"
        fill="none"
        stroke="#59d499"
        strokeWidth="4.5"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M47 13 a24.5 24.5 0 0 1 0 38"
        fill="none"
        stroke="#59d499"
        strokeWidth="4.5"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}
