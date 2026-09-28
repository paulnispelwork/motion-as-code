import { deliverables, formats, hero, outcomes, outcomesTitle } from "@/lib/content";

// The film's content as a plain document: what screen readers, search engines,
// reduced-motion visitors and no-JS browsers get. Same copy as the film.
export function StaticContent() {
  return (
    <div className="static-page mx-auto max-w-3xl px-5 pb-10 pt-32 md:pt-40">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">{hero.eyebrow}</p>
      <h1 className="display mt-6 text-[clamp(44px,8vw,96px)] leading-[0.98]">
        {hero.line1} <span className="serif accent-text">{hero.line2}.</span>
      </h1>
      <p className="mt-8 max-w-xl text-[18px] leading-relaxed text-[var(--text-muted)]">{hero.sub}</p>

      <section className="mt-24">
        <h2 className="section-label">What we make</h2>
        <ul className="mt-6 grid gap-3 md:grid-cols-3">
          {formats.map((format) => (
            <li key={format.title} className="static-card">
              <h3 className="text-[20px] font-medium tracking-tight">{format.title}</h3>
              <p className="mt-2 font-mono text-[12px] text-[var(--ember)]">{format.meta}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">{format.use}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-24">
        <h2 className="section-label">{outcomesTitle}</h2>
        <ul className="mt-6 space-y-5">
          {outcomes.map((outcome) => (
            <li key={outcome.title}>
              <h3 className="text-[22px] font-medium tracking-tight">{outcome.title}</h3>
              <p className="mt-1 text-[16px] leading-relaxed text-[var(--text-muted)]">{outcome.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-[15px] text-[var(--text-muted)]">Every film comes with: {deliverables.join(", ")}.</p>
      </section>
    </div>
  );
}
