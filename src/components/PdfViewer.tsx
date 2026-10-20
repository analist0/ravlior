// In-page PDF reader (pdf.js). Files come from our own storage (/api/media/...), never a third-party host.
// Page navigation, zoom, fit-to-width, text search with hit navigation, fullscreen. RTL UI, touch friendly.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Icon } from './Icon.tsx';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = (worker as { default: string }).default;
    return lib;
  });
  return pdfjsPromise;
}

export function isOwnMediaUrl(src: string): boolean {
  return src.startsWith('/api/media/');
}

export function PdfViewer({ src, title }: { src: string; title: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const task = useRef<RenderTask | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<number[] | null>(null);
  const [hitIdx, setHitIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [full, setFull] = useState(false);
  const texts = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setDoc(null); setError(null); setPage(1); texts.current.clear();
    loadPdfJs()
      .then((lib) => lib.getDocument({ url: src, isEvalSupported: false, withCredentials: false }).promise)
      .then((d) => { if (!cancelled) setDoc(d); })
      .catch(() => { if (!cancelled) setError('לא ניתן היה לטעון את הקובץ.'); });
    return () => { cancelled = true; };
  }, [src]);

  const render = useCallback(async () => {
    if (!doc || !canvas.current || !wrap.current) return;
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const width = Math.max(240, wrap.current.clientWidth - 2);
    const scale = zoom === 'fit' ? width / base.width : zoom;
    const vp = p.getViewport({ scale });
    const ratio = window.devicePixelRatio || 1;
    const c = canvas.current;
    c.width = Math.floor(vp.width * ratio);
    c.height = Math.floor(vp.height * ratio);
    c.style.width = `${Math.floor(vp.width)}px`;
    c.style.height = `${Math.floor(vp.height)}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    task.current?.cancel();
    const t = p.render({ canvasContext: ctx, viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
    task.current = t;
    try { await t.promise; } catch { /* cancelled */ }
  }, [doc, page, zoom]);

  useEffect(() => { void render(); }, [render, full]);
  useEffect(() => {
    const onResize = () => { if (zoom === 'fit') void render(); };
    window.addEventListener('resize', onResize);
    const onFs = () => setFull(document.fullscreenElement === wrap.current?.parentElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => { window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFs); };
  }, [render, zoom]);

  const pages = doc?.numPages ?? 0;
  const go = (n: number) => setPage((cur) => Math.min(Math.max(1, Number.isFinite(n) ? n : cur), pages || 1));
  const zoomBy = (f: number) => setZoom((z) => {
    const cur = z === 'fit' ? (canvas.current ? canvas.current.clientWidth / 600 : 1) : z;
    return Math.min(4, Math.max(0.4, Math.round(cur * f * 100) / 100));
  });

  const textOf = async (n: number): Promise<string> => {
    const cached = texts.current.get(n);
    if (cached !== undefined) return cached;
    const p = await doc!.getPage(n);
    const tc = await p.getTextContent();
    const s = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ');
    texts.current.set(n, s);
    return s;
  };
  const norm = (s: string) => s.replace(/[\u0591-\u05C7]/g, '').toLowerCase();
  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!doc || !query.trim()) { setHits(null); return; }
    setSearching(true);
    const q = norm(query.trim());
    const found: number[] = [];
    for (let n = 1; n <= doc.numPages; n++) if (norm(await textOf(n)).includes(q)) found.push(n);
    setSearching(false);
    setHits(found); setHitIdx(0);
    if (found[0]) setPage(found[0]);
  };
  const stepHit = (d: number) => {
    if (!hits?.length) return;
    const i = (hitIdx + d + hits.length) % hits.length;
    setHitIdx(i); setPage(hits[i]!);
  };
  const toggleFull = () => {
    const el = wrap.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  return (
    <section className={`pdf-viewer${full ? ' is-full' : ''}`} dir="rtl" aria-label={`קורא PDF: ${title}`}>
      <div className="pdf-toolbar" role="toolbar" aria-label="פקדי הקורא">
        <div className="pdf-group">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="עמוד קודם"><Icon name="up" className="rot-r" /></button>
          <label className="pdf-page">
            <span className="sr-only">מספר עמוד</span>
            <input type="number" inputMode="numeric" min={1} max={pages || 1} value={page} onChange={(e) => go(Number(e.target.value))} />
            <span className="soft">/ {pages || '…'}</span>
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(page + 1)} disabled={!pages || page >= pages} aria-label="עמוד הבא"><Icon name="down" className="rot-r" /></button>
        </div>
        <div className="pdf-group">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomBy(1 / 1.2)} aria-label="הקטנה">−</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoom('fit')} aria-pressed={zoom === 'fit'}>{zoom === 'fit' ? 'רוחב מלא' : `${Math.round(zoom * 100)}%`}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => zoomBy(1.2)} aria-label="הגדלה">+</button>
        </div>
        <form className="pdf-group pdf-search" onSubmit={search} role="search">
          <label className="sr-only" htmlFor="pdf-q">חיפוש בקובץ</label>
          <input id="pdf-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש בקובץ" />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!doc || searching} aria-label="חיפוש"><Icon name="search" /></button>
          {hits && <span className="soft" aria-live="polite">{hits.length ? `${hitIdx + 1}/${hits.length} עמודים` : 'לא נמצא'}</span>}
          {hits && hits.length > 1 && <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => stepHit(-1)} aria-label="תוצאה קודמת">‹</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => stepHit(1)} aria-label="תוצאה הבאה">›</button>
          </>}
        </form>
        <div className="pdf-group">
          <button type="button" className="btn btn-secondary btn-sm" onClick={toggleFull} aria-pressed={full}>{full ? 'יציאה ממסך מלא' : 'מסך מלא'}</button>
        </div>
      </div>
      <div className="pdf-stage" ref={wrap}>
        {error ? <p className="notice">{error}</p> : !doc ? <p className="soft" style={{ padding: 'var(--s-6)' }}>טוען את הקובץ…</p> : null}
        <canvas ref={canvas} aria-label={`${title}, עמוד ${page}`} role="img" />
      </div>
    </section>
  );
}
