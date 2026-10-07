/**
 * Plain text from our own FAQ HTML, for JSON-LD that is written into a
 * <script> unescaped. A character walk rather than a tag regex: no "<" or ">"
 * survives, so nothing like "<scr<b>ipt>" can reassemble into a tag.
 */
export function stripTags(html: string): string {
  let out = "";
  let inTag = false;
  for (const ch of html) {
    if (ch === "<") inTag = true;
    else if (ch === ">") inTag = false;
    else if (!inTag) out += ch;
  }
  return out;
}
