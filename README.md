# Poker voices

Four distinct preset speakers generated with Higgsfield on 2026-10-22.
The game serves these MP3 files from its own origin; there are no runtime speech-provider requests or device TTS dependencies.

| Setting | Speaker | Catalog gender | Source generation |
|---|---|---|---|
| classic | Grady | male | 084f55bb-ec15-41fa-804f-a2a02f353141 |
| calm | Holden | male | c24940c8-772c-442d-bb54-e8ff7a6320bc |
| bright | Ainsley | female | 5b778e0e-a8db-4211-9ff8-4f8abae143cb |
| korean | Hana (하나), Korean | female | cbf84f09-f280-44f7-ba95-92b21a42324e |

Spoken calls, in order: Ping, Quarter, Half, Check, Call, Die, All in, Bet.
They map to the existing buttons 삥, 쿼터, 하프, 체크, 콜, 다이, 올인, 베팅.

Grady, Holden and Ainsley use Seed Audio and eight one-second slots. Hana uses Text to Speech V2 / ElevenLabs, Korean text (삥, 쿼터, 하프, 체크, 콜, 다이, 올인, 베팅), and eight 1.6-second slots. The Korean introduction and closing line are excluded from the asset. No real person's nationality is inferred from the synthetic voice name.

`voices.mjs` bounds playback to the individual call and its short tail. Files are mono 24 kHz / 64 kbit/s MP3, with consistent per-call levels, short silence padding and edge fades. All eight words in every source were checked with local speech recognition before segmenting.

The local player's saved choice always belongs to view seat 0. Other seats use the remaining voices in catalog order, with no duplicates in a four-player game. Assignments stay stable across turns and rounds and are recalculated when the choice changes. Online assignments are local listening preferences; they do not overwrite another member's saved choice. Voices preload after a user gesture, share volume/mute controls, and use the existing same-origin asset cache.
