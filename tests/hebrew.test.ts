import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heMatches, heNormalize, slugify } from '../src/shared/hebrew.ts';

test('niqqud, geresh/gershayim and final letters are normalized', () => {
  assert.equal(heNormalize('עוּלוּ אוּשְׁפִּיזִין'), 'עולו אושפיזינ');
  assert.equal(heNormalize('זצ"ל'), heNormalize('זצ״ל'));
  assert.equal(heNormalize('ט"ו באב'), 'טו באב');
  assert.equal(heNormalize('שליט\'\'א'), 'שליטא');
});

test('search: tokens AND, niqqud-insensitive; no morphology promised', () => {
  assert.ok(heMatches('מעלת האושפיזין ומענייני ברכת לישב בסוכה', 'אוּשְׁפִּיזִין'));
  assert.ok(heMatches('הלכות קריאת מגילה בזמני אזעקה', 'מגילה אזעקה'));
  assert.ok(!heMatches('הלכות קריאת מגילה', 'מגילה שופר'));
});

test('slugify keeps Hebrew and strips punctuation', () => {
  assert.equal(slugify('מחלוקת?! הרי קורח רצה שלמות!'), 'מחלוקת-הרי-קורח-רצה-שלמות');
  assert.equal(slugify('!!!'), 'item');
});
