# Nuvio Source Select — experimental

One Stremio-compatible addon with a checkbox configuration page for All-in-One-Nuvio sources. This is an initial implementation, not a verified all-provider conversion. No hosting is deployed by this commit.

## Run

Requires Node.js 22+. Run `npm run check`, then `npm start`. Open http://localhost:7000/configure, select sources, and generate the manifest URL. Localhost is only suitable for testing on the same machine. Other devices need a publicly reachable HTTPS deployment. GitHub Pages cannot run this service.

For IMDb IDs, set the service environment variable `TMDB_API_KEY` to your own TMDB API key. Explicit `tmdb:123` IDs do not require that lookup. Do not commit API keys.

Deploy the Dockerfile to a compatible Node/container host. Free deployment has NOT been validated or guaranteed. Free tiers may impose time, memory, concurrency or network limits; enabling many sources may exceed them.

Install the generated URL in Nuvio Addons. Changing selection requires generating a new URL and updating/replacing the installed addon. The checkboxes are on the addon configuration page, not promised to be native controls inside Nuvio.

## Compatibility and security

This bridge loads the upstream manifest and provider JavaScript from https://github.com/NuvioPlugin/All-in-One-Nuvio at runtime. Upstream code is not copied into this repository. All attribution remains upstream; review upstream redistribution terms before vendoring any providers.

WARNING: this executes remotely fetched upstream JavaScript. Node vm and worker threads are NOT security sandboxes. Run only in a disposable isolated service with no unrelated credentials, no sensitive network access and no sensitive mounted files. Provider code is fetched from mutable main; upstream changes can alter behavior. Do not expose this service publicly without considering authentication, rate limiting and provider-code review/pinning. Those protections are not implemented here.

The initial adapter assumes CommonJS `getStreams(tmdbId, type, season, episode)` and maps series to tv. Only HTTP(S) stream URLs are returned. Providers requiring browser APIs, native Nuvio APIs, require imports, cookies/settings, torrent infohash handling, different identifiers or signatures may fail or be unsupported. Individual provider settings and token entry are not implemented. Each provider is terminated after 20 seconds; at most four run concurrently per request. There is no global request concurrency limiter. Playback headers are mapped to behaviorHints.proxyHeaders; support depends on the client.

No live provider playback tests or Nuvio device tests have been performed. Do not interpret a valid manifest or configuration page as proof that a source works.
