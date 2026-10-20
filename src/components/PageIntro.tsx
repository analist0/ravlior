import type { ReactNode } from 'react';

const MARK = import.meta.env.BASE_URL + 'images/topics-hero-640.webp';

/** Navy hall head shared by the public desks. Reading sheets under it stay paper. */
export function PageIntro({ eyebrow, title, lede, mark = false, children }: { eyebrow?: string; title: string; lede?: string; mark?: boolean; children?: ReactNode }) {
  return (
    <header className={`page-hero${mark ? ' has-mark' : ''}`}>
      {mark && <img className="page-hero-mark" src={MARK} alt="" width={168} height={168} />}
      <div className="qa-rule" aria-hidden="true" />
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {lede && <p className="page-lede">{lede}</p>}
      {children}
    </header>
  );
}
