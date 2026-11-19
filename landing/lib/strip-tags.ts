/**
 * Entities our own FAQ HTML uses, as the characters they stand for. "&lt;" and
 * "&gt;" are left out on purpose: the output goes into JSON-LD that is written
 * into a <script> unescaped, so no "<" or ">" may come back out of this file.
 */
const ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&middot;": "·",
  "&nbsp;": " ",
};

/**
 * Plain text from our own FAQ HTML, for JSON-LD that is written into a
 * <script> unescaped. A character walk rather than a tag regex: no "<" or ">"
 * survives, so nothing like "<scr<b>ipt>" can reassemble into a tag. Entities
 * are decoded after the walk, so a decoded character is never read as a tag,
 * and "&amp;" is decoded last so "&amp;quot;" ends up as the text "&quot;".
 */
export function stripTags(html: string): string {
  let out = "";
  let inTag = false;
  for (const ch of html) {
    if (ch === "<") inTag = true;
    else if (ch === ">") inTag = false;
    else if (!inTag) out += ch;
  }
  return out
    .replace(/&(?:quot|#x27|#39|ldquo|rdquo|middot|nbsp);/g, (e) => ENTITIES[e])
    .replace(/&amp;/g, "&");
}
