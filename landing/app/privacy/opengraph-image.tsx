import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "@/lib/og";
import { PRIVACY_DESCRIPTION, PRIVACY_TITLE } from "./copy";

export const alt = "What anotifier.io collects";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  return renderOg({
    kicker: "PRIVACY",
    title: PRIVACY_TITLE,
    description: PRIVACY_DESCRIPTION,
    path: "/privacy/",
  });
}
