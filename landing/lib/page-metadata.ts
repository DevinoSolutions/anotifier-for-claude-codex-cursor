import type { Metadata } from "next";

/**
 * The metadata block every content page ships: title, description, canonical
 * URL and the Open Graph and Twitter tags. Next replaces a page's `openGraph`
 * as a whole rather than merging it with the layout's, which is why each page
 * repeats all of it (and why the share images come from the opengraph-image
 * file convention, not from here).
 */
export function pageMetadata(page: {
  /** Absolute canonical URL, trailing slash included. */
  url: string;
  title: string;
  description: string;
  ogType: "website" | "article";
  /** Open Graph and Twitter title when it differs from the `<title>`. */
  shareTitle?: string;
}): Metadata {
  const shareTitle = page.shareTitle ?? page.title;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.url },
    openGraph: {
      type: page.ogType,
      siteName: "anotifier",
      url: page.url,
      title: shareTitle,
      description: page.description,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description: page.description,
    },
  };
}
