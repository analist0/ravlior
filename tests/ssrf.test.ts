import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, guardedLookup, isBlockedIp, SsrfError } from '../server/lib/ssrf.ts';

test('private, loopback, link-local and metadata IPs are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1'])
    assert.ok(isBlockedIp(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '151.101.1.69', '2606:4700::1111']) assert.ok(!isBlockedIp(ip), ip);
});

test('URL checks: https only, no creds, 443 only, no internal hosts, allowlist', () => {
  const bad = ['http://kol-barama.co.il/a.mp3', 'https://user:pw@kol-barama.co.il/a', 'https://kol-barama.co.il:8443/a', 'https://localhost/a',
    'https://127.0.0.1/a', 'https://[::1]/a', 'https://169.254.169.254/latest/meta-data', 'https://metadata.google.internal/', 'file:///etc/passwd'];
  for (const u of bad) assert.throws(() => checkUrl(u, ['kol-barama.co.il']), SsrfError, u);
  assert.throws(() => checkUrl('https://evil.example/a.mp3', ['kol-barama.co.il']), SsrfError);
  assert.equal(checkUrl('https://www.kol-barama.co.il/a.mp3', ['kol-barama.co.il']).hostname, 'www.kol-barama.co.il');
});

test('DNS answers pointing to private ranges are refused at connect time', async () => {
  const err = await new Promise<Error | null>((resolve) => guardedLookup('localhost', {}, (e) => resolve(e)));
  assert.ok(err instanceof SsrfError);
});
