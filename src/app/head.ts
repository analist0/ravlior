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

export function useHead(opts: { title: string; description?: string | null; path?: string; noindex?: boolean; image?: string | null; type?: string; jsonLd?: unknown }) {
  const { title, description, path, noindex, image, type, jsonLd } = opts;
  useEffect(() => {
    const full = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — תורתו של הרב ליאור כהן`;
    document.title = full;
    meta('name', 'description', description ?? null);
    meta('name', 'robots', noindex ? 'noindex, nofollow' : null);
    const url = path !== undefined && SITE_URL ? SITE_URL + path : null;
    link('canonical', noindex ? null : url);
    meta('property', 'og:title', full);
    meta('property', 'og:description', description ?? null);
    meta('property', 'og:type', type ?? 'website');
    meta('property', 'og:url', noindex ? null : url);
    meta('property', 'og:image', image ?? null);
    meta('property', 'og:locale', 'he_IL');
    const id = 'page-jsonld';
    const prev = document.getElementById(id);
    if (!jsonLd) prev?.remove();
    else {
      const el = prev ?? document.createElement('script');
      el.id = id;
      el.setAttribute('type', 'application/ld+json');
      el.textContent = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
      if (!prev) document.head.appendChild(el);
    }
  }, [title, description, path, noindex, image, type, jsonLd]);
}
