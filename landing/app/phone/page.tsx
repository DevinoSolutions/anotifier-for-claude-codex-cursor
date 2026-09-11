import ChannelPage, { buildChannelMetadata } from "@/components/ChannelPage";
import "../[slug]/agent-page.css";

export const metadata = buildChannelMetadata("phone");

export default function PhonePage() {
  return <ChannelPage slug="phone" />;
}
