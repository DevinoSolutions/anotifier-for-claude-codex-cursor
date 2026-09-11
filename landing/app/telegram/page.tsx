import ChannelPage, { buildChannelMetadata } from "@/components/ChannelPage";
import "../[slug]/agent-page.css";

export const metadata = buildChannelMetadata("telegram");

export default function TelegramPage() {
  return <ChannelPage slug="telegram" />;
}
