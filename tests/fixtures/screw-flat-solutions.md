# Flat-game physical witnesses

Every stage starts with three parking holes. The rigid-body tests solve the eleven introductory stages, the special flower at stage 25, and the 988 generated stages. Each transfer has a screw ID, a different destination hole and a settling time. The game accepts every legal transfer regardless of the solution used in testing.

Stages 122–1000 each record a tested plate variant, a move ceiling, and the fraction of a screw head that must clear the edge of adjacent metal when parking. The ceiling is the length of a verified three-hole route. A shorter route may exist. The test helper reconstructs the route from a search strategy and simulates the real collisions. The game never loads these strategies.

Run `node tests/screw-flat-all-routes.test.cjs` to verify all generated stages. `node tests/screw-flat-routes.test.cjs` also plays stage 122 through the tap handlers, checks that its three-hole clear earns a valid replay, and uses a drill for a four-hole ranked clear.
