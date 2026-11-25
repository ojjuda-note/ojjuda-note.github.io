// Run `npm ci && npm run build` in this directory after changing a pinned dependency.
// These libraries load only when a member selects/uploads a video.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreVersion = '1.66.2';
const tusVersion = '4.3.1';
const coreFile = `mediabunny-${coreVersion}.mjs`;
const aacFile = `mediabunny-aac-encoder-${coreVersion}.mjs`;
const tusFile = `tus-js-client-${tusVersion}.mjs`;
const common = {
  absWorkingDir: here,
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  legalComments: 'inline',
};

await build({
  ...common,
  stdin: {
    contents: `export {
      Input, BlobSource, BufferSource, MP4, QTFF, WEBM, Output, BufferTarget,
      Mp4OutputFormat, Conversion, Quality, canEncodeVideo, canEncodeAudio,
      CustomAudioEncoder, AudioSample, EncodedPacket, EncodedPacketSink, registerEncoder, Logging
    } from 'mediabunny';`,
    resolveDir: here,
    sourcefile: 'park-media-vendor-entry.js',
  },
  outfile: path.join(here, coreFile),
  banner: { js: `/*! Mediabunny ${coreVersion}, MPL-2.0. Source and license: ./NOTICE.md */` },
});

// The upstream browser distribution contains the AAC worker and its WASM binary.
// Keep it separate, and resolve its peer to the same core module (one registry).
await build({
  ...common,
  entryPoints: [path.join(here, 'node_modules/@mediabunny/aac-encoder/dist/bundles/mediabunny-aac-encoder.min.mjs')],
  plugins: [{
    name: 'same-mediabunny-registry',
    setup(builder) {
      builder.onResolve({ filter: /^mediabunny$/ }, () => ({ path: `./${coreFile}`, external: true }));
    },
  }],
  outfile: path.join(here, aacFile),
  banner: { js: `/*! @mediabunny/aac-encoder ${coreVersion}, MPL-2.0; FFmpeg AAC, LGPL-2.1+. See ./NOTICE.md */` },
});

const tusBuild = await build({
  ...common,
  metafile: true,
  stdin: {
    contents: "export { Upload } from 'tus-js-client';",
    resolveDir: here,
    sourcefile: 'park-tus-vendor-entry.js',
  },
  outfile: path.join(here, tusFile),
  banner: { js: `/*! tus-js-client ${tusVersion}, MIT. Source and licenses: ./NOTICE.md */` },
});

await mkdir(path.join(here, 'licenses'), { recursive: true });
for (const [from, to] of [
  ['mediabunny/LICENSE', 'mediabunny-MPL-2.0.txt'],
  ['@mediabunny/aac-encoder/LICENSE', 'mediabunny-aac-encoder-MPL-2.0.txt'],
  ['@mediabunny/aac-encoder/licenses/ffmpeg/COPYING.LGPLv2.1', 'ffmpeg-LGPL-2.1.txt'],
  ['@mediabunny/aac-encoder/licenses/ffmpeg/LICENSE.md', 'ffmpeg-NOTICE.md'],
  ['@mediabunny/aac-encoder/README.md', 'aac-build-and-source.md'],
  ['tus-js-client/LICENSE', 'tus-js-client-MIT.txt'],
]) {
  const license = await readFile(path.join(here, 'node_modules', from), 'utf8');
  await writeFile(path.join(here, 'licenses', to), `${license.trimEnd()}\n`);
}

// Preserve notices from the dependencies actually included in the browser TUS bundle.
const bundledPackages = new Set(Object.keys(tusBuild.metafile.inputs)
  .map(filename => filename.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1])
  .filter(name => name && name !== 'tus-js-client'));
let transitiveNotices = '# Dependencies bundled with tus-js-client\n';
for (const name of [...bundledPackages].sort()) {
  const dir = path.join(here, 'node_modules', name);
  const metadata = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  const licenseNames = (await readdir(dir)).filter(filename => /^(license|licence|copying)(\..*)?$/i.test(filename));
  transitiveNotices += `\n## ${name} ${metadata.version}\n\nLicense: ${metadata.license}\n`;
  if (!licenseNames.length) throw new Error(`Missing license text for bundled dependency ${name}`);
  for (const filename of licenseNames) transitiveNotices += `\n${await readFile(path.join(dir, filename), 'utf8')}\n`;
}
await writeFile(path.join(here, 'licenses', 'tus-dependencies.txt'), `${transitiveNotices.trimEnd()}\n`);

const manifest = {};
for (const filename of [coreFile, aacFile, tusFile]) {
  const bytes = await readFile(path.join(here, filename));
  manifest[filename] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await writeFile(path.join(here, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));

// The G2 QR opens the hosted Park page. Bundle the official bridge locally.
await build({
  ...common,
  entryPoints: [path.resolve(here, '../glasses-even-g2.mjs')],
  nodePaths: [path.join(here, 'node_modules')],
  outfile: path.resolve(here, '../../park/even-g2.bundle.mjs'),
});

// The dictionary loads only when Park needs to tag a new post.
const { cp } = await import('node:fs/promises');
const tagger = 'garu-ko-0.14.0';
for (const asset of ['dist/browser.js', 'dist/core.js', 'dist/normalize.js', 'pkg', 'models/base.gmdl',
  'models/NOTICE.md', 'models/bulk-provenance.json', 'models/licenses', 'LICENSE', 'NOTICE']) {
  await cp(path.join(here, 'node_modules/garu-ko', asset), path.join(here, tagger, asset), { recursive: true });
}
