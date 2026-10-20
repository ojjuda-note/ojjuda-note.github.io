from pathlib import Path
import hashlib
p=Path('note/preview.js')
expected='a7152e9664c65a39e73dba67b09299c86e3e38c51c2f27eb031328578779cc7a'
actual=hashlib.sha256(p.read_bytes()).hexdigest()
if actual!=expected:
 assert actual=='248d9c16f22529eee00758cbc75ba230941d3f4a976b39913cea39a351de70db','Unexpected base: note/preview.js'
 s=p.read_text()
 def change(a,b):
  global s
  assert s.count(a)==1,(a[:80],s.count(a))
  s=s.replace(a,b)
 change('function fitPhotoQuote(photo, quote, tagRow) {\n  if (!photo.isConnected) return;', 'function fitPhotoQuote(photo, quote, tagRow, initialFontSize) {\n  // A hidden feed has zero bounds, not an overflowing card. Leave its layout intact.\n  if (!photo.isConnected || photo.getBoundingClientRect().width <= 0) return;')
 change("  if (!quote.dataset.baseFontSize) quote.dataset.baseFontSize = String(parseFloat(getComputedStyle(quote).fontSize));\n  const base = Number(quote.dataset.baseFontSize);", "  // Start from the authored size each time, including responsive CSS after a resize.\n  quote.style.fontSize = initialFontSize;\n  const base = parseFloat(getComputedStyle(quote).fontSize);")
 change('fitPhotoQuote(entry.photo, entry.quote, entry.tagRow);','fitPhotoQuote(entry.photo, entry.quote, entry.tagRow, entry.initialFontSize);')
 change('    entry.full.hidden = !photoQuoteClipped(entry.photo, entry.quote, entry.tagRow);', '    if (entry.photo.getBoundingClientRect().width <= 0) continue;\n    entry.full.hidden = !photoQuoteClipped(entry.photo, entry.quote, entry.tagRow);')
 change('  quoteFitEntries.add({ photo, quote, tagRow });','  quoteFitEntries.add({ photo, quote, tagRow, initialFontSize: quote.style.fontSize });')
 change('  feed.hidden = false; detail.hidden = true;\n  window.scrollTo', '  feed.hidden = false; detail.hidden = true;\n  requestTagFit();\n  window.scrollTo')
 assert hashlib.sha256(s.encode()).hexdigest()==expected
 p.write_text(s)
p=Path('world.html')
expected='ad06e63f286ce3cbad14a731b129f4bb53f7a5f2467603ae9d19362b7d39f462'
actual=hashlib.sha256(p.read_bytes()).hexdigest()
if actual!=expected:
 assert actual=='5fcbbb2dcfc9e8aead48854373eb92409771506aff4988c144d8dc50c9d9a224','Unexpected base: world.html'
 s=p.read_text().replace('world-park-notes.js?v=20261020-notes1','world-park-notes.js?v=20261021-font1').replace('0.46.5-beta','0.46.6-beta')
 assert hashlib.sha256(s.encode()).hexdigest()==expected
 p.write_text(s)
