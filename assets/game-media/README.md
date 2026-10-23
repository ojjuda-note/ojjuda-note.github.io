# Cached game media

Extracted from commit `8fba28c37b15cf7a3d211324c6f6ba4862e370cd` on 2026-10-23.
The 40 photo JPEGs and 48 hwatu WebPs are byte-for-byte copies of the original
embedded images. Solo and online Matgo share the same URLs. Only displayed
cards and the selected photo stage request their images.

Jua and Black Han Sans were converted from embedded TTF to WOFF2 without
subsetting. Every glyph's coordinates, metrics and character mapping were
verified against the originals. Font naming and license metadata remain in
the font files. The Three.js r128 script is unchanged, including its MIT notice.

Hwatu artwork: Marcus Richert, based on Louie Mantia Jr., CC BY-SA 4.0.
Source: https://www.marcusrichert.com/images/hwatu/
The existing artwork credits and adaptations remain unchanged.

`manifest.json` records byte lengths and SHA-256 hashes. Filenames contain a
content hash so a changed image or font gets a new cache key. Keep image
dimensions, transparency and quality when replacing an asset.
