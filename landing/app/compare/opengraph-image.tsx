import { COMPARE_DESCRIPTION, COMPARE_TITLE } from "@/lib/alternatives";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "@/lib/og";

export const alt = "anotifier compared with the alternatives";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return renderOg({
    kicker: "COMPARE",
    title: COMPARE_TITLE,
    description: COMPARE_DESCRIPTION,
    path: "/compare/",
  });
}
