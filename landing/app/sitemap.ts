import type { MetadataRoute } from "next";
import { AGENTS } from "@/lib/agents";
import { CHANNELS } from "@/lib/channels";
import { GUIDES } from "@/lib/guides";
import { PAGE_UPDATED, SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

// Each URL carries the date its own content last changed, so <lastmod> is a
// signal Google can trust rather than one shared date on every page.
const newest = (dates: string[]) => dates.reduce((a, b) => (a > b ? a : b));

export default function sitemap(): MetadataRoute.Sitemap {
  const entry = (
    path: string,
    updated: string,
    priority: number,
    changeFrequency: "weekly" | "monthly" = "weekly",
  ) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(updated),
    changeFrequency,
    priority,
  });
  return [
    entry("/", PAGE_UPDATED.home, 1),
    entry("/docs/", PAGE_UPDATED.docs, 0.9),
    // The index lists every guide, so it changes whenever one does.
    entry("/guides/", newest(GUIDES.map((g) => g.updated)), 0.8),
    ...GUIDES.map((g) => entry(`/guides/${g.slug}/`, g.updated, 0.8)),
    entry("/compare/", PAGE_UPDATED.compare, 0.8, "monthly"),
    ...AGENTS.map((agent) => entry(`/${agent.slug}/`, agent.updated, 0.8)),
    ...CHANNELS.map((channel) =>
      entry(`/${channel.slug}/`, channel.updated, 0.7),
    ),
  ];
}
