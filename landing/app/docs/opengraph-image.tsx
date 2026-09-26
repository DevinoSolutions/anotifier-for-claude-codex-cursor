import { DOCS_DESCRIPTION, DOCS_TITLE } from "@/lib/docs";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "@/lib/og";

export const alt = "anotifier documentation";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return renderOg({
    kicker: "DOCS",
    title: DOCS_TITLE,
    description: DOCS_DESCRIPTION,
    path: "/docs/",
  });
}
