// IndexNow notifies Bing, Yandex and the other IndexNow participants in one POST.
// Google retired https://www.google.com/ping (June 2023). Google picks up new URLs from
// the dynamic sitemap listed in robots.txt; this module does not call that dead endpoint.

export async function pingIndexNow(opts: {
  siteUrl: string;
  key: string;
  urls: string[];
  fetchImpl?: typeof fetch;
}): Promise<{ skipped: boolean; status: number | null }> {
  const key = opts.key.trim();
  const site = opts.siteUrl.replace(/\/$/, '');
  if (!site || !/^[A-Za-z0-9-]{8,128}$/.test(key)) return { skipped: true, status: null };
  let host = '';
  try { host = new URL(site).host; } catch { return { skipped: true, status: null }; }
  const urls = [...new Set(opts.urls.filter((u) => {
    try { return new URL(u).host === host; } catch { return false; }
  }))].slice(0, 100);
  if (!urls.length) return { skipped: true, status: null };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `${site}/indexnow-key.txt`, urlList: urls }),
    signal: AbortSignal.timeout(4000),
  });
  return { skipped: false, status: res.status };
}
