# Source status and investigation notes

Last updated: 2026-11-03. These are observations from this project's Render deployment and user tests, not guarantees for all titles, networks, devices, or future requests.

## Status summary

| Source | Evidence | Current status |
| --- | --- | --- |
| CNO | Source tester returned one link; measured 2.51 seconds initially and 0.06 seconds on a repeat request, with the same count. | Link extraction confirmed. Explicit device-playback confirmation was not recorded in those tests. |
| PressPlay / MoviesAPI | User confirmed Nuvio playback. Family Guy S22E1 was tested using TMDB 1434. Later source tests returned two links, with 32.88 seconds initially and 0.22 seconds on repeat. | Playback confirmed by the user for the tested content. Uncached browser extraction remains relatively slow. |
| Levidia / Wootly | Exact Family Guy S22E1 page; ordinary browser flow returned 302 to a signed MP4 and final 206 `video/mp4` with byte ranges. A local adapter prototype and installer are present but uncommitted. | Fixture tests and installer-chain check pass. Live backend execution and Nuvio playback are not verified; this prototype currently supports TMDB 1434 only. |
| 4KHDHub | User reported working results previously, then reported that its results were missing after subsequent changes. | Previously working; missing-results issue remains unresolved. Do not mark currently broken or currently verified without a targeted test. |
| Movy / Miami | An experimental custom adapter exists. | No confirmed working playback in the recorded investigation. Not proven impossible. |
| Nepu | An ordinary request from Render returned HTTP 403 and a Cloudflare 'Just a moment...' page. | Parked after the ordinary-request block. No successful Render extraction established; a Chromium test was not recorded. |
| Streaming Unity | Both the watch page and iframe route returned HTTP 403 from ordinary Render requests. A normal Chromium request also returned HTTP 403, 'Attention Required! | Cloudflare', and no playlist. | Parked: blocked from this Render deployment. Not added as a selectable source. This does not establish that the website is broken in a user's browser. |

## Why CNO was simpler

The CNO adapter requests a structured source list from beta.cno.to using the TMDB identifier and requested episode:

- TV: /screen-api/tv/{tmdbId}/episode/{season}/{episode}
- Movie: /screen-api/movie/{tmdbId}

It selects HLS entries from the returned sources array and attaches playback headers. Relative /api/s/ playback links on the beta origin are mapped to cno.to. It does not need Chromium. Success is still dependent on source availability and the returned links.

PressPlay's selected player was MoviesAPI. Its adapter runs the embedded player in Chromium to capture a playlist request, then obtains the advertised quality variants. This extra browser and player work explains the different extraction path; exact timing varies.

## Streaming Unity stopping point

User-supplied test page: https://streamingunity.fun/en/watch/976?e=89463 (Family Guy S22E1, as supplied by the user).

Tested iframe route: /en/iframe/976?episode_id=89463&canPlayFHD=1.

The first detector incorrectly reported challengeDetected=false despite the Cloudflare block title. The detector was corrected; the browser check then reported blocked_in_normal_browser and playlistFound=false. No CAPTCHA-solving or challenge-bypass logic was added.

Automatic Streaming Unity startup probes were disabled in commit 008e871. The diagnostic module remains available in the repository; its --install mode preserves the open-by-default collapsible Source tester without running network probes. Revisit only with a specific new lead, not repeated identical startup probes.

## Interpretation rules

- A returned link is not proof of correct content or successful playback.
- User-confirmed playback is evidence for the tested title, episode, device, and time, not every title.
- HTTP 403 from this deployment is not proof that a website is globally unavailable.
- Source-health counters observe extraction results; they are not independent playback verification.
- Cached-request speedups do not establish faster first-request extraction.
- Other upstream providers have not all been individually verified. Do not infer their status from this table.
