/** One `<script type="application/ld+json">` block; `data` is a lib/jsonld.ts builder result (or an array of them). */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
