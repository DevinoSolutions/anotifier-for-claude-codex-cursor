import { AGENTS, getAgent } from "@/lib/agents";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "@/lib/og";

export const alt = "anotifier for your coding agent";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return AGENTS.map((a) => ({ slug: a.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const agent = getAgent((await params).slug)!;
  return renderOg({
    kicker: agent.name.toUpperCase(),
    title: agent.title,
    description: agent.description,
    icons: [agent.icon],
    path: `/${agent.slug}/`,
  });
}
