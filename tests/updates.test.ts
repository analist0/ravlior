import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMobile, validateUpdate } from '../src/shared/updates.ts';

const now = 1_700_000_000_000;
const base = { consent: true, website: '', startedAt: now - 5000 };

test('email is stored lowercased; whatsapp becomes 05XXXXXXXX', () => {
  const email = validateUpdate({ ...base, channel: 'email', contact: '  A@Example.com ' }, now);
  assert.equal(email.ok && email.value.contact, 'a@example.com');
  assert.equal(normalizeMobile('+972-52-555-6677'), '0525556677');
  const phone = validateUpdate({ ...base, channel: 'whatsapp', contact: '052-5556677' }, now);
  assert.equal(phone.ok && phone.value.contact, '0525556677');
});

test('consent, honeypot, speed and bad numbers are refused', () => {
  assert.equal(validateUpdate({ ...base, channel: 'email', contact: 'a@b.co', consent: false }, now).ok, false);
  assert.equal(validateUpdate({ ...base, channel: 'email', contact: 'a@b.co', website: 'http://spam' }, now).ok, false);
  assert.equal(validateUpdate({ ...base, channel: 'email', contact: 'a@b.co', startedAt: now }, now).ok, false);
  assert.equal(validateUpdate({ ...base, channel: 'whatsapp', contact: '03-1234567' }, now).ok, false);
  assert.equal(validateUpdate({ ...base, channel: 'email', contact: 'not-an-email' }, now).ok, false);
});
