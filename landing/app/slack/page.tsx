import ChannelPage, { buildChannelMetadata } from "@/components/ChannelPage";
import "../[slug]/agent-page.css";

export const metadata = buildChannelMetadata("slack");

export default function SlackPage() {
  return <ChannelPage slug="slack" />;
}
