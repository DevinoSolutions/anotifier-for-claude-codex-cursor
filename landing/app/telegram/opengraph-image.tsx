import { getChannel } from "@/lib/channels";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "@/lib/og";

export const alt = "anotifier telegram notifications";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  const channel = getChannel("telegram")!;
  return renderOg({
    kicker: channel.name.toUpperCase(),
    title: channel.title,
    description: channel.description,
    path: "/telegram/",
  });
}
