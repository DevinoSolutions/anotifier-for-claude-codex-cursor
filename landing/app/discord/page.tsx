import ChannelPage, { buildChannelMetadata } from "@/components/ChannelPage";
import "../[slug]/agent-page.css";

export const metadata = buildChannelMetadata("discord");

export default function DiscordPage() {
  return <ChannelPage slug="discord" />;
}
