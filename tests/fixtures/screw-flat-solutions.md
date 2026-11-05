# Flat-game physical witnesses

All 988 generated stages (12–1000 excluding special stage 25) have been replay-certified against the real metal/screw collision world. The twelve introductory/special stages are covered in `screw-flat.test.cjs`.

Each local witness step records a screw ID, destination hole ID, and optional settling time. A `null` destination means all metal has left the board while the final screw is held. Full move witnesses are kept in the local regenerable `flat-certified-work.jsonl`, not shipped to the game or GitHub, so neither the client nor tests distribute an answer key.

`screw-flat-all-routes.test.cjs` regenerates an independent solution for each of the 988 stages with actual rigid-body stepping, including screw contacts and physical departure of all metal. `screw-flat-routes.test.cjs` plays fourteen selected advanced solutions through the real UI tap/animation handlers, and checks geometric access, the three original spare holes, and item-assisted recovery.

The game's `VALIDATED_LAYOUTS` table stores only the generation seed offset, metal scale, and witness pickup count. It never loads the witness or uses the sequence to allow a move. The free move budget is the verified count plus two. These witnesses do not establish shortest paths or unique solutions.

`tests/helpers/flat-solution-search.cjs` regenerates the witness; the optional offline `certify-flat-solutions.cjs` additionally replays each step. `finalize-flat-certificates.cjs` converts a complete 988-stage log to the small production layout/budget table. The search tries natural release/support moves; a failed search is not proof of impossibility. Candidate paths must pass an independent replay before modifying the production geometry/budget table.
