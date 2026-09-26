import type { Block } from "@/lib/docs";
import CodeBlock from "./CodeBlock";
import Inline from "./Inline";

/** Renders a list of content blocks. Shared by the docs, guides and compare pages.
    `placement` names the page kind in copy_command analytics events. */
export default function Blocks({
  blocks,
  placement = "docs",
}: {
  blocks: Block[];
  placement?: string;
}) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "p":
            return (
              <p key={i}>
                <Inline text={block.text} />
              </p>
            );
          case "note":
            return (
              <aside key={i} className="note">
                <Inline text={block.text} />
              </aside>
            );
          case "code":
            return (
              <CodeBlock
                key={i}
                code={block.code}
                lang={block.lang}
                placement={placement}
              />
            );
          case "ul":
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={i} className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      {block.head.map((h, j) => (
                        <th key={j} scope="col">
                          <Inline text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k}>
                            <Inline text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
