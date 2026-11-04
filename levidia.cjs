'use strict';

// Experimental Levidia adapter for the supported Family Guy regression.
// Uses the site's normal page/player flow; it does not decode or hardcode signed URLs.
const SHOWS = new Map([['1434', 'family-guy']]);
let busy = false;

function parseEpisodeHref(href) {
  try {
    const slug = new URL(href).searchParams.get('watch') || '';
    const match = /-s(\d{1,2})e(\d{1,3})(?:-|$)/i.exec(slug);
    return match ? { season: Number(match[1]), episode: Number(match[2]) } : null;
  } catch { return null; }
}
function findEpisodeLink(links, season, episode) {
  return links.find(link => {
    const parsed = parseEpisodeHref(link.href);
    return parsed?.season === season && parsed?.episode === episode;
  }) || null;
}
function isWootlyHost(host) { return /(^|\.)wootly\.ch$/i.test(String(host)); }
function isAccessGate(status, title = '', text = '') {
  return status === 403 || status === 429 || /just a moment|attention required|access denied|verify (?:that )?you(?:'|’)re human|security verification|captcha/i.test(title + ' ' + text);
}
function qualityFrom(filename) {
  const match = /(?:^|[.\s_-])(2160|1080|720|480)p?(?=$|[.\s_-])/i.exec(filename);
  return match ? match[1] + 'p' : 'unknown';
}
function fallbackFilename(season, episode) {
  return `Family.Guy.S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}.mp4`;
}
function filenameFromTitle(title, season, episode) {
  const clean = String(title || '').replace(/[\\/\r\n\0]/g, ' ').trim();
  if (/\.(?:mp4|mkv|webm|m4v)$/i.test(clean) && clean.length <= 240) return clean;
  return fallbackFilename(season, episode);
}
function timeoutMs(deadline, cap) { return Math.max(1, Math.min(cap, deadline - Date.now())); }
async function defaultLaunch(options) {
  const { chromium } = require('playwright-core');
  return chromium.launch(options);
}
async function gateOnPage(page, status) {
  if (status === 403 || status === 429) return true;
  const title = await page.title().catch(() => '');
  const text = await page.locator('body').innerText({ timeout: 1500 }).catch(() => '');
  return isAccessGate(status, title, text);
}

async function getStreams(id, type, season, episode, options = {}) {
  const { signal, deadline = Date.now() + 60000, launch = defaultLaunch } = options;
  if (busy || signal?.aborted || String(id) !== '1434' || type !== 'tv' ||
      !Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1 || Date.now() >= deadline) return [];

  busy = true;
  const started = Date.now();
  let stage = 'browser_launch';
  let browser, context, popup;
  const log = data => console.log(JSON.stringify({ event: 'levidia_provider', ...data, ms: Date.now() - started }));
  const close = () => { if (browser) browser.close().catch(() => {}); };
  const onAbort = () => close();
  const hardStop = setTimeout(close, timeoutMs(deadline, 60000));
  hardStop.unref?.();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    browser = await launch({ executablePath: '/usr/bin/chromium', headless: true, timeout: timeoutMs(deadline, 15000), args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
    if (signal?.aborted || Date.now() >= deadline) return [];
    context = await browser.newContext();
    const page = await context.newPage();
    const slug = SHOWS.get(String(id));
    if (!slug) return [];

    stage = 'season_listing';
    const seasonUrl = new URL('https://www.levidia.ch/tv-show.php');
    seasonUrl.searchParams.set('watch', slug);
    seasonUrl.searchParams.set('s', String(season));
    const seasonResponse = await page.goto(seasonUrl.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs(deadline, 15000) });
    if (await gateOnPage(page, seasonResponse?.status() || 0)) {
      log({ stage, outcome: 'access_gate', status: seasonResponse?.status() || 0 });
      return [];
    }
    const episodeLinks = await page.locator('a[href*="tv-episode.php"]').evaluateAll(links => links.map(a => ({ href: a.href, title: a.innerText.trim() })));
    const selected = findEpisodeLink(episodeLinks, season, episode);
    if (!selected) {
      log({ stage, outcome: 'episode_not_listed', season, episode });
      return [];
    }

    stage = 'episode_page';
    const episodeResponse = await page.goto(selected.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs(deadline, 15000) });
    if (await gateOnPage(page, episodeResponse?.status() || 0)) {
      log({ stage, outcome: 'access_gate', status: episodeResponse?.status() || 0 });
      return [];
    }
    const wootlyRow = page.locator('li').filter({ hasText: /Wootly/i }).first();
    const playLink = wootlyRow.locator('a').filter({ hasText: /Play in Flash/i }).first();
    if (!(await playLink.count())) {
      log({ stage, outcome: 'wootly_option_missing', season, episode });
      return [];
    }

    stage = 'open_player';
    const popupPromise = context.waitForEvent('page', { timeout: timeoutMs(deadline, 15000) }).catch(() => null);
    await playLink.click({ timeout: timeoutMs(deadline, 10000) });
    popup = await popupPromise;
    if (!popup) {
      log({ stage, outcome: 'player_window_missing' });
      return [];
    }
    await popup.waitForURL(url => {
      try { return isWootlyHost(new URL(String(url)).hostname); } catch { return false; }
    }, { timeout: timeoutMs(deadline, 15000) }).catch(() => {});
    await popup.waitForLoadState('domcontentloaded', { timeout: timeoutMs(deadline, 10000) }).catch(() => {});
    let host = '';
    try { host = new URL(popup.url()).hostname; } catch {}
    if (!isWootlyHost(host) || await gateOnPage(popup, 0)) {
      log({ stage, outcome: isWootlyHost(host) ? 'access_gate' : 'unexpected_player_host', host: host.slice(0, 120) });
      return [];
    }

    stage = 'capture_embed';
    const iframe = popup.locator('iframe').first();
    await iframe.waitFor({ state: 'attached', timeout: timeoutMs(deadline, 10000) });
    const iframeSrc = await iframe.getAttribute('src');
    if (!iframeSrc) {
      log({ stage, outcome: 'embed_src_missing', season, episode });
      return [];
    }
    let embedUrl;
    try { embedUrl = new URL(iframeSrc, popup.url()); } catch { return []; }
    if (embedUrl.protocol !== 'https:' || !isWootlyHost(embedUrl.hostname)) {
      log({ stage, outcome: 'unexpected_embed_host', host: String(embedUrl.hostname || '').slice(0, 120) });
      return [];
    }
    const filename = filenameFromTitle(await popup.title().catch(() => ''), season, episode);
    const quality = qualityFrom(filename);
    log({ stage, outcome: 'embed_found', host: embedUrl.hostname, quality, playbackVerified: false });
    return [{ name: 'Levidia / Wootly embed test', title: filename, filename, quality, url: embedUrl.href }];
  } catch (error) {
    log({ stage, outcome: signal?.aborted ? 'cancelled' : 'failed', errorType: String(error?.name || 'Error').replace(/[^A-Za-z]/g, '').slice(0, 60) });
    return [];
  } finally {
    clearTimeout(hardStop);
    signal?.removeEventListener('abort', onAbort);
    if (context) {
      for (const openPage of context.pages()) if (openPage !== popup) await openPage.close().catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    busy = false;
  }
}

module.exports = { getStreams, parseEpisodeHref, findEpisodeLink, isWootlyHost, isAccessGate, qualityFrom, filenameFromTitle };
