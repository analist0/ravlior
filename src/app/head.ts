import { useEffect } from 'react';
import { SITE_URL } from './config.ts';
import { HOME_TITLE, HERO_IMAGE, SITE_NAME, webPageJsonLd } from '../shared/seo.ts';

// Client-side head. The same fields are written into static HTML by scripts/prerender.ts
// and into live HTML by the API, so a crawler does not need this effect.
const HERO_W = 1600;
const HERO_H = 800;

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

export function useHead(opts: {
  title: string;
  description?: string | null;
  path?: string;
  noindex?: boolean;
  image?: string | null;
  imageAlt?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  type?: string;
  jsonLd?: Record<string, unknown> | null;
}) {
  const { title, description, path, noindex, image, imageAlt, imageWidth, imageHeight, type, jsonLd } = opts;
  useEffect(() => {
    const full = title ? `${title} | ${SITE_NAME}` : HOME_TITLE;
    document.title = full;
    meta('name', 'description', description ?? null);
    meta('name', 'robots', noindex ? 'noindex, nofollow' : null);
    const url = !noindex && path !== undefined && SITE_URL ? SITE_URL + encodeURI(path) : null;
    link('canonical', url);
    document.head.querySelectorAll('link[data-seo="alt"]').forEach((el) => el.remove());
    if (url) {
      for (const lang of ['he', 'he-IL', 'x-default']) {
        const el = document.createElement('link');
        el.rel = 'alternate';
        el.hreflang = lang;
        el.href = url;
        el.dataset.seo = 'alt';
        document.head.appendChild(el);
      }
    }
    const hero = !noindex && SITE_URL ? `${SITE_URL}${HERO_IMAGE}` : null;
    const img = image || hero;
    meta('property', 'og:site_name', SITE_NAME);
    meta('property', 'og:title', full);
    meta('property', 'og:description', description ?? null);
    meta('property', 'og:type', type ?? 'website');
    meta('property', 'og:url', url);
    meta('property', 'og:image', img);
    meta('property', 'og:image:alt', img ? (imageAlt || title || SITE_NAME) : null);
    meta('property', 'og:image:width', img ? String(image ? (imageWidth ?? '') : HERO_W) || null : null);
    meta('property', 'og:image:height', img ? String(image ? (imageHeight ?? '') : HERO_H) || null : null);
    meta('property', 'og:locale', 'he_IL');
    meta('name', 'twitter:card', img ? 'summary_large_image' : 'summary');
    meta('name', 'twitter:title', full);
    meta('name', 'twitter:description', description ?? null);
    meta('name', 'twitter:image', img);
    const ld = noindex ? null : (jsonLd ?? (path && description ? webPageJsonLd(SITE_URL, path, full, description) : null));
    let script = document.getElementById('seo-jsonld');
    if (!ld) script?.remove();
    else {
      if (!script) {
        script = document.createElement('script');
        script.id = 'seo-jsonld';
        script.setAttribute('type', 'application/ld+json');
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(ld);
    }
  }, [title, description, path, noindex, image, imageAlt, imageWidth, imageHeight, type, jsonLd]);
}
