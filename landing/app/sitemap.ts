import type { MetadataRoute } from "next";
import { AGENTS } from "@/lib/agents";
import { CHANNELS } from "@/lib/channels";
import { GUIDES } from "@/lib/guides";
import { CONTENT_UPDATED, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(CONTENT_UPDATED);
  const entry = (
    path: string,
    priority: number,
    changeFrequency: "weekly" | "monthly" = "weekly",
  ) => ({ url: `${SITE_URL}${path}`, lastModified, changeFrequency, priority });
  return [
    entry("/", 1),
    entry("/docs/", 0.9),
    entry("/guides/", 0.8),
    ...GUIDES.map((g) => entry(`/guides/${g.slug}/`, 0.8)),
    entry("/compare/", 0.8, "monthly"),
    ...AGENTS.map((agent) => entry(`/${agent.slug}/`, 0.8)),
    ...CHANNELS.map((channel) => entry(`/${channel.slug}/`, 0.7)),
  ];
}
