'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseEpisodeHref, findEpisodeLink, isWootlyHost, isAccessGate, isMp4Response, qualityFrom, filenameFromTitle, getStreams } = require('./levidia.cjs');
const { patchServer, patchPool, patchProviderCache, patchTester, patchConfig, patchPolicy } = require('./install-levidia.cjs');
const pressplay = require('./install-pressplay.cjs');

assert.deepEqual(parseEpisodeHref('https://www.levidia.ch/tv-episode.php?watch=family-guy-s22e1-fertilized-megg'), { season: 22, episode: 1 });
assert.equal(parseEpisodeHref('https://www.levidia.ch/tv-episode.php?watch=family-guy-s2e10-example').episode, 10);
assert.equal(parseEpisodeHref('https://example.invalid/no-episode'), null);
const links = [
  { href: 'https://www.levidia.ch/tv-episode.php?watch=family-guy-s22e2-next', title: 'Next' },
  { href: 'https://www.levidia.ch/tv-episode.php?watch=family-guy-s22e1-fertilized-megg', title: 'Fertilized Megg' }
];
assert.equal(findEpisodeLink(links, 22, 1).title, 'Fertilized Megg');
assert.equal(findEpisodeLink(links, 21, 1), null);
assert.equal(isWootlyHost('www.wootly.ch'), true);
assert.equal(isWootlyHost('web.wootly.ch'), true);
assert.equal(isWootlyHost('wootly.example.invalid'), false);
assert.equal(isAccessGate(403), true);
assert.equal(isAccessGate(200, 'Just a moment'), true);
assert.equal(isAccessGate(200, 'Wootly', 'Play'), false);
assert.equal(isMp4Response(206, { 'content-type': 'video/mp4' }), true);
assert.equal(isMp4Response(200, { 'content-type': 'application/octet-stream' }), false);
assert.equal(qualityFrom('Family.Guy.S22E01.720p.WEB.h264-BAE.WT11.mp4'), '720p');
assert.equal(filenameFromTitle('Family.Guy.S22E01.720p.WEB.h264-BAE.WT11.mp4', 22, 1), 'Family.Guy.S22E01.720p.WEB.h264-BAE.WT11.mp4');
assert.equal(filenameFromTitle('', 22, 1), 'Family.Guy.S22E01.mp4');

(async () => {
  assert.deepEqual(await getStreams('other', 'tv', 22, 1), []);
  assert.deepEqual(await getStreams('1434', 'movie', 22, 1), []);
  assert.deepEqual(await getStreams('1434', 'tv', 0, 1), []);

  const fixtureUrl = 'https://media.example.test/episode.mp4?token=fixture';
  const filename = 'Family.Guy.S22E01.720p.WEB.h264-BAE.WT11.mp4';
  const mediaResponse = {
    status: () => 206,
    headers: () => ({ 'content-type': 'video/mp4', 'content-range': 'bytes 0-99/100' }),
    url: () => fixtureUrl,
    request: () => ({ allHeaders: async () => ({ referer: 'https://web.wootly.ch/e/fixture', 'user-agent': 'fixture' }) })
  };
  const primeButton = { first() { return this; }, waitFor: async () => {}, click: async () => {} };
  const frame = { locator: () => primeButton };
  const iframe = { waitFor: async () => {}, contentFrame: async () => frame };
  const popup = {
    url: () => 'https://www.wootly.ch/?v=fixture', title: async () => filename,
    waitForURL: async () => {}, waitForLoadState: async () => {}, close: async () => {},
    locator: selector => selector === 'iframe' ? { first: () => iframe } : { innerText: async () => 'Wootly player' },
    waitForResponse: async () => mediaResponse
  };
  const playLink = { count: async () => 1, click: async () => {} };
  const row = { locator: () => ({ filter: () => ({ first: () => playLink }) }) };
  const page = {
    goto: async () => ({ status: () => 200 }), title: async () => 'Family Guy Season 22', close: async () => {},
    locator: selector => selector === 'body' ? { innerText: async () => 'Family Guy' } : selector === 'li' ? { filter: () => ({ first: () => row }) } : { evaluateAll: async () => links }
  };
  const context = { newPage: async () => page, waitForEvent: async () => popup, pages: () => [page, popup] };
  const browser = { newContext: async () => context, close: async () => {} };
  const streams = await getStreams('1434', 'tv', 22, 1, { deadline: Date.now() + 30000, launch: async () => browser });
  assert.equal(streams.length, 1);
  assert.equal(streams[0].url, fixtureUrl);
  assert.equal(streams[0].filename, filename);
  assert.equal(streams[0].quality, '720p');
  assert.equal(streams[0].headers.referer, 'https://web.wootly.ch/e/fixture');

  const rawServer = fs.readFileSync('server.cjs', 'utf8');
  const pressplayServer = pressplay.patchServer(rawServer);
  const patchedServer = patchServer(pressplayServer);
  assert.ok(patchedServer.includes("id:'levidia'"));
  assert.ok(patchedServer.includes("require('./levidia.cjs').getStreams(...args,{signal,deadline})"));
  assert.ok(patchedServer.includes("sources.some(id=>['pressplay','levidia'].includes(id))?60000:18000"));
  assert.equal(patchServer(patchedServer), patchedServer);

  for (const [file, patch] of [
    ['pool.cjs', patchPool], ['provider-cache.cjs', patchProviderCache],
    ['source-tester.cjs', patchTester], ['config-page.cjs', patchConfig],
    ['source-policy.cjs', patchPolicy]
  ]) {
    const base = fs.readFileSync(file, 'utf8');
    let text = base;
    if (file === 'source-tester.cjs' && !base.includes("['pressplay','levidia'].includes(source)")) text = pressplay.patchTester(base);
    if (file === 'config-page.cjs' && !base.includes("'levidia':'Experimental; browser captured")) text = pressplay.patchConfig(base);
    const once = patch(text);
    assert.equal(patch(once), once, `${file} patch is idempotent`);
  }
  console.log('Levidia adapter and installer tests passed. Live playback is not part of this fixture suite.');
})().catch(error => { console.error(error); process.exitCode = 1; });
