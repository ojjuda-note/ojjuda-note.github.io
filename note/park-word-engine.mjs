import { Garu } from './vendor/garu-ko-0.14.0/dist/browser.js';
import { parkWordTags } from './park-word-tags.mjs?v=1';
export async function loadTagger() {
  const analyzer = await Garu.load();
  return body => parkWordTags(body, analyzer);
}
