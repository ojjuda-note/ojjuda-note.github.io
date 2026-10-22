# Poker voices

Three distinct preset speakers generated with Higgsfield Seed Audio on 2026-10-22.
The game serves these MP3 files from its own origin; there are no runtime speech-provider requests or device TTS dependencies.

| Setting | Speaker | Catalog gender | Source generation |
|---|---|---|---|
| classic | Grady | male | 084f55bb-ec15-41fa-804f-a2a02f353141 |
| calm | Holden | male | c24940c8-772c-442d-bb54-e8ff7a6320bc |
| bright | Ainsley | female | 5b778e0e-a8db-4211-9ff8-4f8abae143cb |

Spoken calls, in order: Ping, Quarter, Half, Check, Call, Die, All in, Bet.
They map to the existing buttons 삥, 쿼터, 하프, 체크, 콜, 다이, 올인, 베팅.

Each asset contains eight one-second slots. `voices.mjs` bounds playback to the individual call and its short tail. Files are mono 24 kHz / 64 kbit/s MP3, with consistent per-call levels, short silence padding and edge fades. All eight words in every source were checked with local speech recognition before segmenting.
