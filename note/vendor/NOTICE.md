# Park media dependencies

These pinned browser modules load only while preparing or uploading a video.
The original library source is unmodified; `build.mjs` bundles and minifies selected
exports and redirects the AAC extension's peer import to the local core module.

| Module | Version | License | Original source |
| --- | --- | --- | --- |
| Mediabunny | 1.66.2 | MPL-2.0 | https://registry.npmjs.org/mediabunny/-/mediabunny-1.66.2.tgz |
| @mediabunny/aac-encoder | 1.66.2 | MPL-2.0, with FFmpeg AAC under LGPL-2.1 or later | https://registry.npmjs.org/@mediabunny/aac-encoder/-/aac-encoder-1.66.2.tgz |
| tus-js-client | 4.3.1 | MIT | https://registry.npmjs.org/tus-js-client/-/tus-js-client-4.3.1.tgz |

Copyright notices and complete license text are in `licenses/`. Source archives
include the TypeScript sources. `licenses/aac-build-and-source.md` includes the
AAC bridge/worker build instructions and exact FFmpeg/Emscripten provenance. The
unmodified corresponding FFmpeg source is
https://github.com/FFmpeg/FFmpeg/tree/60a2818f76dcd1fee3155b1791304af104a0fc1b
and https://github.com/FFmpeg/FFmpeg/archive/60a2818f76dcd1fee3155b1791304af104a0fc1b.tar.gz.
Upstream: https://github.com/Vanilagy/mediabunny and
https://github.com/tus/tus-js-client.

Rebuild with `npm ci && npm run build` in this directory. `package-lock.json`
records dependency integrity hashes. `manifest.json` records deployed bundle sizes
and SHA-256 hashes. No third party CDN is contacted when these modules load.
Generated `.mjs` bundles and `node_modules` are ignored by Git. CI builds the same
files from the locked packages before publishing the site.
