import { GUIDES, getGuide } from "@/lib/guides";
import { OG_CONTENT_TYPE, OG_SIZE, renderOg } from "@/lib/og";

export const alt = "anotifier guide";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const guide = getGuide((await params).slug)!;
  return renderOg({
    kicker: `GUIDE · ${guide.name.toUpperCase()}`,
    title: guide.h1,
    description: guide.description,
    icons: guide.icon ? [guide.icon] : undefined,
    path: `/guides/${guide.slug}/`,
  });
}
