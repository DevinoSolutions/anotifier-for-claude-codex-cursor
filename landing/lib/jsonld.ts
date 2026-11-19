/**
 * schema.org JSON-LD builders shared by every page that carries structured
 * data. The key order inside each object is part of the output (the page
 * serialises it with JSON.stringify), so do not reorder keys here without
 * meaning to change the structured data every page ships.
 */
import { GITHUB_URL, NPM_URL, SITE_URL } from "./site";

const CONTEXT = "https://schema.org";

/** A question and its plain-text answer. */
export type FaqItem = { q: string; a: string };

/** The Organization that authors the guides, docs and compare pages. */
const AUTHOR = {
  "@type": "Organization",
  name: "DevinoSolutions",
  url: "https://github.com/DevinoSolutions",
};

/** SoftwareApplication node of an agent or channel page. */
export function softwareApplicationLd(description: string) {
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    name: "anotifier",
    operatingSystem: "macOS, Windows, Linux",
    applicationCategory: "DeveloperApplication",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    url: `${SITE_URL}/`,
    sameAs: [GITHUB_URL, NPM_URL],
    description,
  };
}

/** The FAQPage node without @context, for use inside an `@graph`. */
export function faqPageNode(items: FaqItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function faqPageLd(items: FaqItem[]) {
  return { "@context": CONTEXT, ...faqPageNode(items) };
}

/** Trail of pages, first to last; positions count from 1. */
export function breadcrumbListLd(trail: { name: string; url: string }[]) {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

export function techArticleLd(article: {
  headline: string;
  description: string;
  url: string;
  dateModified: string;
  /** Adds `isAccessibleForFree: true` (guides and docs, not compare). */
  free?: boolean;
  /** The thing the article is about, when it names one. */
  about?: object;
}) {
  return {
    "@context": CONTEXT,
    "@type": "TechArticle",
    headline: article.headline,
    description: article.description,
    url: article.url,
    dateModified: article.dateModified,
    inLanguage: "en",
    ...(article.free ? { isAccessibleForFree: true } : {}),
    author: AUTHOR,
    publisher: { "@id": `${SITE_URL}/#org` },
    ...(article.about ? { about: article.about } : {}),
  };
}
