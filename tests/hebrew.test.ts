import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heKeyboard, heMatches, heNormalize, heSearchFold, heSkeleton, slugify } from '../src/shared/hebrew.ts';

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

test('ktiv male and haser share a skeleton', () => {
  assert.equal(heSkeleton('תפילה'), heSkeleton('תפלה'));
  assert.equal(heSkeleton('מצווה'), heSkeleton('מצוה'));
  assert.equal(heSkeleton('שבוע'), 'שבע');
  assert.ok(heMatches('הלכות תפילה', 'תפלה'));
  assert.ok(heMatches('ברכת המזון ומצוה', 'מצווה'));
  assert.ok(!heMatches('הלכות קריאת מגילה', 'מגילה שופר'));
});

test('spelling variants: doubled yod or vav, and Hebrew typed on a Latin keyboard', () => {
  assert.equal(heSearchFold('עניין'), 'ענינ');
  assert.equal(heSearchFold('ענין'), heSearchFold('עניין'));
  assert.equal(heSearchFold('וודאי'), 'ודאי');
  assert.equal(heKeyboard('xufv'), 'סוכה');
  assert.equal(heSearchFold(heKeyboard('vfk')), 'הכל');
  assert.ok(heMatches('מעלת האושפיזין ומענייני ברכת לישב בסוכה', 'ענין'));
  assert.ok(heMatches('מעלת האושפיזין ומענייני ברכת לישב בסוכה', 'xufv'));
  assert.ok(!heMatches('הלכות קריאת מגילה', 'xufv'));
});

test('slugify keeps Hebrew and strips punctuation', () => {
  assert.equal(slugify('מחלוקת?! הרי קורח רצה שלמות!'), 'מחלוקת-הרי-קורח-רצה-שלמות');
  assert.equal(slugify('!!!'), 'item');
});
