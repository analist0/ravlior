import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLibraryState } from '../app/library-state.tsx';
import { usePrefs } from '../app/prefs.tsx';
import { readJSON, writeJSON } from '../app/storage.ts';
import { heMatches } from '../shared/hebrew.ts';
import { Icon } from './Icon.tsx';
import { useToast } from './Toast.tsx';
import { embedUrl, formatDuration, youtubeThumb } from '../shared/media.ts';
import type { ContentItem, MediaChapter, MediaSource } from '../shared/types.ts';
import { splitTitle } from './ui.tsx';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const RATE_KEY = 'video-rate.v1';
const YT_ORIGIN = 'https://www.youtube-nocookie.com';

function post(frame: HTMLIFrameElement | null, payload: unknown) {
  frame?.contentWindow?.postMessage(JSON.stringify(payload), YT_ORIGIN);
}

/** YouTube facade (iframe only after a click) or a native video file. No third-party script. */
export function LessonPlayer({
  item,
  source,
  kind,
  startAt = null,
  resume = true,
  notes = false,
}: {
  item: ContentItem;
  source: MediaSource;
  kind: 'embed' | 'video';
  startAt?: number | null;
  resume?: boolean;
  notes?: boolean;
}) {
  const { progress, saveProgress, isFavorite, toggleFavorite, isWatchLater, toggleWatchLater } = useLibraryState();
  const { reducedMotion } = usePrefs();
  const toast = useToast();
  const frameId = useId().replace(/:/g, '');
  const anchorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [main] = splitTitle(item.title);
  const chapters = (item.chapters ?? []).slice().sort((a, b) => a.t - b.t);
  const [start, setStart] = useState(() => {
    if (startAt != null && startAt > 0) return Math.floor(startAt);
    if (!resume) return 0;
    const saved = progress[item.id];
    if (saved && saved.t > 5 && (!saved.d || saved.t < saved.d - 10)) return Math.floor(saved.t);
    return 0;
  });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(start);
  const [duration, setDuration] = useState<number | null>(item.durationSeconds);
  const [rate, setRate] = useState(() => readJSON(RATE_KEY, 1));
  const [muted, setMuted] = useState(false);
  const [docked, setDocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [noteQuery, setNoteQuery] = useState('');
  const lastSave = useRef(0);
  const stamp = useRef({ t: start, at: 0 });

  const remember = (t: number, d: number | null) => {
    if (t < 3) return;
    saveProgress(item.id, { t, d, at: Date.now(), title: main, slug: item.slug });
  };

  const shownTime = () => {
    if (!playing || kind !== 'embed') return time;
    const extra = stamp.current.at ? ((Date.now() - stamp.current.at) / 1000) * rate : 0;
    return stamp.current.t + extra;
  };

  useEffect(() => writeJSON(RATE_KEY, rate), [rate]);

  useEffect(() => {
    if (!loaded) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting && entry.intersectionRatio > 0.6) setDismissed(false);
      setDocked(entry.intersectionRatio < 0.35);
    }, { threshold: [0, 0.35, 0.6, 1] });
    io.observe(anchor);
    return () => io.disconnect();
  }, [loaded]);

  useEffect(() => {
    if (!loaded || kind !== 'embed') return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN && e.origin !== 'https://www.youtube.com') return;
      let data: unknown = e.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      if (!data || typeof data !== 'object') return;
      const msg = data as { event?: string; info?: unknown };
      if (msg.event === 'onStateChange' && typeof msg.info === 'number') setPlaying(msg.info === 1);
      const info = msg.info && typeof msg.info === 'object' ? msg.info as Record<string, unknown> : null;
      if (!info) return;
      if (typeof info.duration === 'number' && Number.isFinite(info.duration)) setDuration(info.duration);
      if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)) {
        stamp.current = { t: info.currentTime, at: Date.now() };
        setTime(info.currentTime);
        if (Date.now() - lastSave.current > 5000) {
          lastSave.current = Date.now();
          remember(info.currentTime, typeof info.duration === 'number' ? info.duration : duration);
        }
      }
    };
    addEventListener('message', onMsg);
    return () => removeEventListener('message', onMsg);
    // remember is stable enough for this listener; duration is read at event time via the ref pattern below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, kind, item.id]);

  useEffect(() => {
    if (!loaded || !playing || kind !== 'embed') return;
    const id = window.setInterval(() => setTime(shownTime()), 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, playing, kind, rate]);

  const command = (func: string, args: unknown[] = []) => post(iframeRef.current, { event: 'command', func, args });

  const onIframeLoad = () => {
    const frame = iframeRef.current;
    if (!frame) return;
    post(frame, { event: 'listening', id: frame.id, channel: 'widget' });
    command('setPlaybackRate', [rate]);
  };

  const openAt = (sec: number) => {
    const next = Math.max(0, Math.floor(sec));
    if (!loaded) { setStart(next); setTime(next); setLoaded(true); return; }
    seek(next);
  };

  const seek = (sec: number) => {
    const next = Math.max(0, Math.min(sec, (duration ?? sec) > 0 ? (duration ?? sec) : sec));
    if (kind === 'embed') {
      command('seekTo', [next, true]);
      stamp.current = { t: next, at: Date.now() };
    } else if (videoRef.current) videoRef.current.currentTime = next;
    setTime(next);
    remember(next, duration);
  };

  const toggle = () => {
    if (!loaded) { setLoaded(true); setPlaying(true); return; }
    if (kind === 'embed') command(playing ? 'pauseVideo' : 'playVideo');
    else if (videoRef.current) {
      if (videoRef.current.paused) void videoRef.current.play();
      else videoRef.current.pause();
    }
    setPlaying((p) => !p);
  };

  const changeRate = (next: number) => {
    setRate(next);
    if (kind === 'embed') command('setPlaybackRate', [next]);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const toggleMute = () => {
    if (kind === 'embed') command(muted ? 'unMute' : 'mute');
    if (videoRef.current) videoRef.current.muted = !muted;
    setMuted((m) => !m);
  };

  const fullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => toast('המסך המלא לא זמין בדפדפן זה', { tone: 'error' }));
  };

  const shareAt = async () => {
    const t = Math.floor(shownTime());
    const url = `${location.origin}/item/${item.slug}${t > 0 ? `?t=${t}` : ''}`;
    const label = t > 0 ? `מ־${formatDuration(t)}` : 'השיעור';
    try {
      if (navigator.share) await navigator.share({ title: main, url });
      else { await navigator.clipboard.writeText(url); toast(`הקישור הועתק (${label})`); }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('לא ניתן לשתף מדפדפן זה', { tone: 'error' });
    }
  };

  const pipWindow = useRef<Window | null>(null);
  const pictureInPicture = async () => {
    if (kind === 'video' && videoRef.current) {
      const video = videoRef.current;
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (document.pictureInPictureEnabled) await video.requestPictureInPicture();
        else toast('תמונה בתוך תמונה אינה זמינה בדפדפן זה', { tone: 'error' });
      } catch {
        toast('תמונה בתוך תמונה אינה זמינה בדפדפן זה', { tone: 'error' });
      }
      return;
    }
    const dpp = (window as Window & { documentPictureInPicture?: { requestWindow: (o?: { width?: number; height?: number }) => Promise<Window> } }).documentPictureInPicture;
    const at = Math.floor(shownTime());
    const pipSrc = kind === 'embed' && source.providerId
      ? embedUrl(source.provider, source.providerId, { start: at, autoplay: true, jsapi: true, origin: location.origin })
      : null;
    if (dpp && pipSrc) {
      try {
        const win = await dpp.requestWindow({ width: 480, height: 270 });
        pipWindow.current = win;
        win.document.body.style.margin = '0';
        win.document.body.style.background = '#000';
        const frame = win.document.createElement('iframe');
        frame.src = pipSrc;
        frame.title = main;
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.setAttribute('allowfullscreen', '');
        frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
        win.document.body.append(frame);
        if (loaded) command('pauseVideo');
        setPlaying(false);
        win.addEventListener('pagehide', () => { pipWindow.current = null; });
        return;
      } catch {
        /* fall through to the in-page dock */
      }
    }
    if (!loaded) setLoaded(true);
    setDismissed(false);
    setDocked(true);
    toast('הנגן עבר לפינה. תמונה בתוך תמונה של הדפדפן אינה זמינה כאן.');
  };

  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const code = e.code;
    if (code === 'Space' || code === 'KeyK') { e.preventDefault(); toggle(); }
    else if (code === 'KeyJ' || code === 'ArrowLeft') { e.preventDefault(); seek(shownTime() - 10); }
    else if (code === 'KeyL' || code === 'ArrowRight') { e.preventDefault(); seek(shownTime() + 10); }
    else if (code === 'KeyM') { e.preventDefault(); toggleMute(); }
    else if (code === 'KeyF') { e.preventDefault(); fullscreen(); }
    else if (code === 'KeyP') { e.preventDefault(); void pictureInPicture(); }
    else if (code === 'Comma') { e.preventDefault(); changeRate(SPEEDS[Math.max(0, SPEEDS.indexOf(rate) - 1)] ?? rate); }
    else if (code === 'Period') { e.preventDefault(); changeRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(rate) + 1)] ?? rate); }
    else if (/^Digit[0-9]$/.test(code) && duration) { e.preventDefault(); seek((duration * Number(code.slice(5))) / 10); }
  };

  const activeChapter = chapters.reduce<MediaChapter | null>((acc, ch) => (shownTime() >= ch.t ? ch : acc), null);
  const mini = loaded && docked && !dismissed;
  const src = kind === 'embed' && source.providerId
    ? embedUrl(source.provider, source.providerId, { start, autoplay: true, jsapi: true, origin: location.origin })
    : null;
  const short = item.type === 'short';
  const posterRef = useRef<HTMLButtonElement>(null);
  const adoptPoster = typeof document !== 'undefined' && !!document.getElementById('hall-lcp');
  useLayoutEffect(() => {
    const img = document.getElementById('hall-lcp');
    const btn = posterRef.current;
    if (!img || !btn || btn.contains(img)) return;
    img.classList.add('is-placed');
    btn.prepend(img);
  }, [loaded]);
  const consentText = kind === 'embed' ? 'הנגן הרשמי של YouTube ייטען בלחיצה' : 'ניגון הקובץ השמור';
  const posterName = [
    `ניגון: ${main}`,
    consentText,
    start > 0 ? `המשך מ־${formatDuration(start)}` : '',
  ].filter(Boolean).join('. ');

  if (failed || (kind === 'embed' && !src)) {
    return (
      <div className="state" style={{ padding: 'var(--s-6)' }}>
        <Icon name="alert" />
        <h3 style={{ margin: 0 }}>הנגן לא הצליח לטעון</h3>
        <p style={{ margin: 0 }}>השיעור נשאר באתר. אפשר לנסות שוב בלי לצאת ליוטיוב.</p>
        <button type="button" className="btn btn-secondary" onClick={() => { setFailed(false); setLoaded(false); }}>נסו שוב</button>
      </div>
    );
  }

  return (
    <div className={`lesson-player ${short ? 'is-short' : ''}`} onKeyDown={onKey}>
      <div className="lesson-slot">
        <div className={`lesson-anchor ${short ? 'short' : ''}`} ref={anchorRef}>
          {mini && (
            <p className="lesson-hold">
              הנגן מוצמד לפינה.
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => anchorRef.current?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })}>חזרה לשיעור</button>
            </p>
          )}
        </div>
        <div
          className={`media-frame ${short ? 'short' : ''} ${mini ? 'is-mini' : 'in-flow'}`}
          ref={shellRef}
          tabIndex={0}
          aria-keyshortcuts="Space KeyK KeyJ KeyL KeyM KeyF KeyP"
          aria-label={`נגן: ${main}`}
        >
          {kind === 'embed' && loaded && src && (
            <iframe
              id={`yt-${frameId}`}
              ref={iframeRef}
              src={src}
              title={`נגן: ${main}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              onLoad={onIframeLoad}
            />
          )}
          {kind === 'video' && loaded && (
            <video
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              src={source.url}
              aria-label={main}
              onPlay={() => setPlaying(true)}
              onPause={() => { setPlaying(false); remember(videoRef.current?.currentTime ?? time, duration); }}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                setTime(t);
                if (Date.now() - lastSave.current > 5000) { lastSave.current = Date.now(); remember(t, duration); }
              }}
              onLoadedMetadata={(e) => {
                const d = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null;
                setDuration(d);
                e.currentTarget.playbackRate = rate;
                if (start > 5) e.currentTarget.currentTime = start;
              }}
              onError={() => setFailed(true)}
            />
          )}
          {!loaded && (
            <button type="button" className="media-poster" ref={posterRef} onClick={() => setLoaded(true)} aria-label={posterName}>
              {kind === 'embed' && source.providerId && !adoptPoster && (
                <img src={youtubeThumb(source.providerId, 'hq')} alt="" width={480} height={360} fetchPriority="high" decoding="async" onError={(e) => e.currentTarget.classList.add('img-failed')} />
              )}
              <span className="play"><Icon name="play" /></span>
              <span className="consent">{consentText}</span>
              {start > 0 && <span className="resume-pill">המשך מ־<span className="ltr">{formatDuration(start)}</span></span>}
            </button>
          )}
          {mini && (
            <div className="mini-bar">
              <span className="mini-title">{main}</span>
              <button type="button" className="icon-btn" aria-label={playing ? 'השהיה' : 'ניגון'} onClick={toggle}><Icon name={playing ? 'pause' : 'play'} /></button>
              <button type="button" className="icon-btn" aria-label="סגירת הנגן הצף" onClick={() => { setDismissed(true); setDocked(false); }}><Icon name="close" /></button>
            </div>
          )}
        </div>
      </div>

      <div className="lesson-tools" role="group" aria-label="בקרת נגן">
        <button type="button" className="icon-btn" aria-label={playing ? 'השהיה' : 'ניגון'} onClick={toggle}><Icon name={playing ? 'pause' : 'play'} /></button>
        <button type="button" className="icon-btn" aria-label="10 שניות אחורה" onClick={() => seek(shownTime() - 10)}><Icon name="back10" /></button>
        <button type="button" className="icon-btn" aria-label="10 שניות קדימה" onClick={() => seek(shownTime() + 10)}><Icon name="fwd10" /></button>
        <span className="player-time ltr">{formatDuration(shownTime())}{duration ? ` / ${formatDuration(duration)}` : ''}</span>
        <label className="row lesson-rate">
          <Icon name="speed" />
          <span className="sr-only">מהירות ניגון</span>
          <select className="select" value={rate} aria-label="מהירות ניגון" onChange={(e) => changeRate(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
          </select>
        </label>
        <button type="button" className="icon-btn" aria-pressed={muted} aria-label={muted ? 'ביטול השתקה' : 'השתקה'} onClick={toggleMute}><Icon name="listen" /></button>
        <button type="button" className="icon-btn" aria-label="מסך מלא" onClick={fullscreen}><Icon name="external" /></button>
        <button type="button" className="icon-btn" aria-label="תמונה בתוך תמונה" onClick={() => void pictureInPicture()}><Icon name="pip" /></button>
        <button type="button" className="icon-btn" aria-pressed={isFavorite(item.id)} aria-label={isFavorite(item.id) ? 'הסרה מהמועדפים' : 'שמירה במועדפים'} onClick={() => toast(toggleFavorite(item.id) ? 'נשמר במועדפים' : 'הוסר מהמועדפים')}><Icon name="bookmark" /></button>
        <button type="button" className="icon-btn" aria-pressed={isWatchLater(item.id)} aria-label={isWatchLater(item.id) ? 'הסרה מצפייה מאוחר יותר' : 'צפייה מאוחר יותר'} onClick={() => toast(toggleWatchLater(item.id) ? 'נשמר לצפייה מאוחר יותר' : 'הוסר מרשימת הצפייה')}><Icon name="clock" /></button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void shareAt()}><Icon name="share" /> שיתוף מהדקה</button>
      </div>
      {duration != null && (
        <input
          className="player-progress lesson-scrub"
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.min(Math.floor(shownTime()), Math.floor(duration))}
          aria-label="מיקום בשיעור"
          aria-valuetext={`${formatDuration(shownTime())} מתוך ${formatDuration(duration)}`}
          onChange={(e) => seek(Number(e.target.value))}
        />
      )}
      <details className="lesson-keys">
        <summary>קיצורי מקלדת</summary>
        <p className="soft">כשהמסגרת סביב הנגן מסומנת, לפי האות הלטינית על המקש גם כשהמקלדת בעברית: רווח או K ניגון, J או חץ שמאלה אחורה, L או חץ ימינה קדימה, M השתקה, F מסך מלא, P תמונה בתוך תמונה, פסיק ונקודה למהירות, ספרות 0–9 קפיצה באחוזים. ציר הזמן נשאר משמאל לימין.</p>
      </details>

      {(chapters.length > 0 || (notes && item.transcript)) && (
        <div className="field lesson-find">
          <label htmlFor={`find-${frameId}`}>חיפוש בפרקים ובתמליל</label>
          <input id={`find-${frameId}`} className="input" type="search" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} placeholder="מילה מתוך הפרק או התמליל" />
        </div>
      )}
      {chapters.length > 0 && (
        <section className="chapter-list" aria-label="פרקי השיעור">
          <h2>פרקים</h2>
          <ol>
            {chapters.filter((ch) => !noteQuery.trim() || heMatches(ch.label, noteQuery)).map((ch) => (
              <li key={`${ch.t}-${ch.label}`}>
                <button type="button" aria-current={activeChapter === ch ? 'true' : undefined} onClick={() => openAt(ch.t)}>
                  <span className="ltr">{formatDuration(ch.t)}</span>
                  <span>{ch.label}</span>
                </button>
              </li>
            ))}
          </ol>
          {noteQuery.trim() && chapters.every((ch) => !heMatches(ch.label, noteQuery)) && <p className="soft">אין פרק עם המילה הזו.</p>}
        </section>
      )}
      {notes && item.transcript && (
        <Transcript text={item.transcript} query={noteQuery} headingId={`tr-${frameId}`} />
      )}
      {notes && chapters.length === 0 && !item.transcript && (
        <p className="soft"><Icon name="info" /> פרקים ותמליל מוצגים רק כשהם קיימים במקור. לשיעור זה לא נוספו.</p>
      )}
    </div>
  );
}

function Transcript({ text, query, headingId }: { text: string; query: string; headingId: string }) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const q = query.trim();
  const shown = q ? lines.filter((l) => heMatches(l, q)) : lines;
  const across = !!q && shown.length === 0 && heMatches(text, q);
  const body = across ? lines : shown;
  return (
    <section className="lesson-transcript" aria-labelledby={headingId}>
      <h2 id={headingId}>תמליל</h2>
      {q && <p className="soft" role="status">{across ? 'המילים מופיעות בחלקים שונים של התמליל.' : `${shown.length} קטעים`}</p>}
      <div className="prose">
        {body.map((line, i) => <p key={i}><Mark text={line} query={q} /></p>)}
      </div>
      {q && shown.length === 0 && !across && <p className="soft">אין התאמה בתמליל.</p>}
    </section>
  );
}

function Mark({ text, query }: { text: string; query: string }) {
  if (!query || !text.includes(query)) return <>{text}</>;
  const parts = text.split(query);
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>{part}{i < parts.length - 1 && <mark>{query}</mark>}</span>
      ))}
    </>
  );
}
