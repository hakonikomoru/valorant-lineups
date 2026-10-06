import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVctPage, eventFromVlr, startDateOf } from '../../scripts/vct/lib/events.mjs';
import { EVENTS } from '../../scripts/vct/events.mjs';

const html = await readFile(new URL('fixtures/vct-2026.html', import.meta.url), 'utf8');

test('VCT のページから大会を読む', () => {
  const cards = parseVctPage(html);
  assert.equal(cards.length, 15);
  const champions = cards.find((c) => c.id === 2766);
  assert.equal(champions.vlrSlug, 'valorant-champions-2026');
  assert.equal(champions.title, 'Valorant Champions 2026');
  assert.equal(champions.status, 'ongoing');
  assert.equal(startDateOf(champions.dates, 2026), '2026-09-24');
});

test('自動で作る大会の slug・地域・短い名前は、手で書いた 2026 年の大会と同じ', () => {
  for (const card of parseVctPage(html)) {
    const auto = eventFromVlr(card, 2026);
    const manual = EVENTS.find((e) => e.id === card.id);
    assert.ok(auto, card.vlrSlug);
    assert.deepEqual([auto.slug, auto.region, auto.year], [manual.slug, manual.region, manual.year], card.vlrSlug);
    if (auto.region !== 'international') assert.deepEqual([auto.name, auto.short], [manual.name, manual.short]);
  }
});

test('来年の大会の形も読める。知らない形の大会は載せない', () => {
  assert.equal(eventFromVlr({ id: 1, vlrSlug: 'vct-2027-emea-stage-2' }, 2027).slug, 'emea-stage2-2027');
  assert.equal(eventFromVlr({ id: 2, vlrSlug: 'valorant-masters-tokyo-2027' }, 2027).name, 'Masters Tokyo 2027');
  assert.equal(eventFromVlr({ id: 3, vlrSlug: 'valorant-champions-2027' }, 2027).slug, 'champions-2027');
  assert.equal(eventFromVlr({ id: 4, vlrSlug: 'vct-2027-ascension-pacific' }, 2027), null);
});
