import { GUIDES_DESCRIPTION, GUIDES_TITLE } from "@/lib/guides";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "@/lib/og";

export const alt = "anotifier notification guides";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return renderOg({
    kicker: "GUIDES",
    title: GUIDES_TITLE,
    description: GUIDES_DESCRIPTION,
    path: "/guides/",
  });
}
