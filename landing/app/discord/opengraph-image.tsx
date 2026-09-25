import { getChannel } from "@/lib/channels";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "@/lib/og";

export const alt = "anotifier discord notifications";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const dynamic = "force-static";

export default function Image() {
  const channel = getChannel("discord")!;
  return renderOg({
    kicker: channel.name.toUpperCase(),
    title: channel.title,
    description: channel.description,
    path: "/discord/",
  });
}
