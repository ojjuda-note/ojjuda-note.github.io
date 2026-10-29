# BANG! in Ojjuda Agit

4–7 signed-in members can create or join a room using its eight-character code. The existing multiplayer room list also shows BANG rooms. The original solo practice and guided tutorial are available within the lobby and do not affect rankings.

The Edge Function validates the signed-in user, applies the shared game engine on the server, and returns only that player's hand and role. State updates use compare-and-swap versions and request IDs. A room member polling after the 45-second decision deadline advances one automatic action.

Rankings show the current consecutive wins within the Korean calendar month. A loss or forfeit resets the streak. Faction victories include eliminated teammates, except forfeiting members. Equal streaks prefer earlier completion. Results are unique per room and member; practice never submits them.

Run `node --test tests/bang-engine.test.mjs tests/bang-tutorial.test.mjs tests/bang-online.test.mjs tests/bang-db.test.cjs` from the repository root after `npm ci --prefix tests`. The BANG workflow runs these checks and deploys only its server bundle from main, using the existing deployment credential. The SQL migration is applied separately before publishing.

Card artwork and BANG! belong to daVinci Editrice S.r.l.; this is an unofficial fan implementation. Source: https://bang.dvgiochi.com/cardslist.php?id=1&lang=en .
