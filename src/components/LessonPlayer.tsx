import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLibraryState } from '../app/library-state.tsx';
import { usePrefs } from '../app/prefs.tsx';
import { readJSON, writeJSON } from '../app/storage.ts';
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
  const { progress, saveProgress } = useLibraryState();
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

  const onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'k') { e.preventDefault(); toggle(); }
    else if (key === 'j' || e.key === 'ArrowLeft') { e.preventDefault(); seek(shownTime() - 10); }
    else if (key === 'l' || e.key === 'ArrowRight') { e.preventDefault(); seek(shownTime() + 10); }
    else if (key === 'm') { e.preventDefault(); toggleMute(); }
    else if (key === 'f') { e.preventDefault(); fullscreen(); }
    else if (/^[0-9]$/.test(key) && duration) { e.preventDefault(); seek((duration * Number(key)) / 10); }
  };

  const activeChapter = chapters.reduce<MediaChapter | null>((acc, ch) => (shownTime() >= ch.t ? ch : acc), null);
  const mini = loaded && docked && !dismissed;
  const src = kind === 'embed' && source.providerId
    ? embedUrl(source.provider, source.providerId, { start, autoplay: true, jsapi: true, origin: location.origin })
    : null;
  const short = item.type === 'short';

  if (failed || (kind === 'embed' && !src)) {
    return (
      <div className="state" style={{ padding: 'var(--s-6)' }}>
        <Icon name="alert" />
        <h3 style={{ margin: 0 }}>הנגן לא הצליח לטעון</h3>
        <a className="btn btn-secondary" href={source.url} target="_blank" rel="noopener noreferrer">פתיחה במקור</a>
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
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-fullscreen"
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
            <button type="button" className="media-poster" onClick={() => setLoaded(true)} aria-label={`ניגון: ${main}${start > 0 ? `, המשך מ־${formatDuration(start)}` : ''}`}>
              {kind === 'embed' && source.providerId && (
                <img src={youtubeThumb(source.providerId, 'hq')} alt="" width={480} height={360} fetchPriority="high" decoding="async" onError={(e) => e.currentTarget.classList.add('img-failed')} />
              )}
              <span className="play"><Icon name="play" /></span>
              <span className="consent">{kind === 'embed' ? 'הנגן הרשמי של YouTube ייטען בלחיצה' : 'ניגון הקובץ השמור'}</span>
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
        <button type="button" className="icon-btn" aria-label="10 שניות אחורה" onClick={() => seek(shownTime() - 10)}><Icon name="fwd10" /></button>
        <button type="button" className="icon-btn" aria-label="10 שניות קדימה" onClick={() => seek(shownTime() + 10)}><Icon name="back10" /></button>
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
        <p className="soft">כשהמסגרת סביב הנגן מסומנת: רווח או K ניגון, J או חץ שמאלה אחורה, L או חץ ימינה קדימה, M השתקה, F מסך מלא, ספרות 0–9 קפיצה באחוזים. ציר הזמן נשאר משמאל לימין.</p>
      </details>

      {chapters.length > 0 && (
        <section className="chapter-list" aria-label="פרקי השיעור">
          <h2>פרקים</h2>
          <ol>
            {chapters.map((ch) => (
              <li key={`${ch.t}-${ch.label}`}>
                <button type="button" aria-current={activeChapter === ch ? 'true' : undefined} onClick={() => openAt(ch.t)}>
                  <span className="ltr">{formatDuration(ch.t)}</span>
                  <span>{ch.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {notes && item.transcript && (
        <section className="lesson-transcript" aria-labelledby={`tr-${frameId}`}>
          <h2 id={`tr-${frameId}`}>תמליל</h2>
          <div className="prose">{item.transcript}</div>
        </section>
      )}
      {notes && chapters.length === 0 && !item.transcript && (
        <p className="soft"><Icon name="info" /> פרקים ותמליל מוצגים רק כשהם קיימים במקור. לשיעור זה לא נוספו.</p>
      )}
    </div>
  );
}
