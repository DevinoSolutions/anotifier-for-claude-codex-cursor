import CopyButton from "@/components/home/CopyButton";

/** A docs/guides code block with a copy button pinned to its corner. The
    button sits outside the <pre> so it stays put when long lines scroll. */
export default function CodeBlock({
  code,
  lang,
  placement,
}: {
  code: string;
  lang?: string;
  /** Page kind, sent with the copy_command analytics event. */
  placement: string;
}) {
  return (
    <div className="codeBlock">
      <pre data-lang={lang}>
        <code>{code}</code>
      </pre>
      <CopyButton text={code} placement={placement} block />
    </div>
  );
}
