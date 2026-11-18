/** The FAQ block of an agent or channel page: one `<details>` per question, the answer as trusted HTML. */
export default function FaqSection({
  name,
  faqs,
}: {
  name: string;
  faqs: { q: string; aHtml: string }[];
}) {
  return (
    <section>
      <div className="kicker">[ FAQ ]</div>
      <h2>{name} questions, answered.</h2>
      {faqs.map((faq, i) => (
        <details key={i}>
          <summary>{faq.q}</summary>
          <div className="a" dangerouslySetInnerHTML={{ __html: faq.aHtml }} />
        </details>
      ))}
    </section>
  );
}
