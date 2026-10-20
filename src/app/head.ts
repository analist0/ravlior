import { useEffect } from 'react';
import { SITE_URL } from './config.ts';

// Client-side head management. Public pages are ALSO pre-rendered with the same metadata
// by scripts/prerender.ts so crawlers get real titles/descriptions without running JS.
export const SITE_NAME = 'אור המאיר';

function meta(attr: 'name' | 'property', key: string, value: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (value === null) { el?.remove(); return; }
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.content = value;
}
function link(rel: string, href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (href === null) { el?.remove(); return; }
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el); }
  el.href = href;
}

const DEFAULT_OG = `${import.meta.env.BASE_URL}images/hero-rabbi-1600.webp`;

export function useHead(opts: {
  title: string;
  description?: string | null;
  path?: string;
  noindex?: boolean;
  image?: string | null;
  type?: string;
  jsonLd?: unknown;
}) {
  const { title, description, path, noindex, image, type, jsonLd } = opts;
  useEffect(() => {
    const full = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — תורתו של הרב ליאור כהן`;
    document.title = full;
    meta('name', 'description', description ?? null);
    meta('name', 'robots', noindex ? 'noindex, nofollow' : null);
    const origin = SITE_URL || location.origin;
    const url = path !== undefined ? origin + path : null;
    link('canonical', noindex || !url ? null : url);
    const img = image && /^https?:/.test(image) ? image : origin + (image || DEFAULT_OG);
    meta('property', 'og:title', full);
    meta('property', 'og:description', description ?? null);
    meta('property', 'og:type', type ?? 'website');
    meta('property', 'og:url', noindex ? null : url);
    meta('property', 'og:image', img);
    meta('property', 'og:image:alt', 'הרב ליאור כהן שליט״א — תורה, הלכה, שיעורים, שאלות ותשובות');
    meta('property', 'og:locale', 'he_IL');
    meta('property', 'og:site_name', SITE_NAME);
    meta('name', 'twitter:card', 'summary_large_image');
    meta('name', 'twitter:title', full);
    meta('name', 'twitter:description', description ?? null);
    meta('name', 'twitter:image', img);
    let script = document.head.querySelector<HTMLScriptElement>('script[data-ld="page"]');
    if (!jsonLd) script?.remove();
    else {
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.dataset.ld = 'page';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
    }
  }, [title, description, path, noindex, image, type, jsonLd]);
}
