# Monster anatomy, NPC camera and snow — 2026-09-25

Implemented in the local game and production build (`dist`).

- New articulated procedural scorpions: eight walking legs, two pincers, plated abdomen, segmented tail and curved sting. Scarabs have six legs and a separate shell. Wolf, alpha, fox, boar and bear use natural quadruped proportions. Regional decorations remain attached to the new anatomy. Fantasy plants/slimes and bats retain their previous designs.
- Shared animation controller handles gait, attacks, death and revival. Templates share geometry and materials; per-creature transforms are independent. Hidden source meshes no longer affect nameplate bounds or click picking.
- NPC clicks clear the held movement input and route. The follow camera keeps a fixed pitch and yaw, retracts smoothly with a 72% minimum boom, and dithers foreground scenery around the sightline.
- Snow uses both sides of foliage normals and adds canopy snow meshes to pine, oak and bush models. Distant snow-biome tree silhouettes are also pale. Existing snow shaders are preserved when applying camera occlusion.
- Service-worker cache updated to `bko-v6-monsters-snow-camera`.

Validation:
- TypeScript check and Vite production build passed. Build retains its large-bundle advisory.
- Full suite initially: 125 passed, 1 skipped, 1 failed due to the old shared-rig attachment expectation. Updated this expectation for independent creature rigs; reran all 9 tests in realm content, anatomy and camera suites: passed. The skipped test requires an external database.
- Live browser: scorpion preview checked; Frostheim white pine canopies checked; clicked Bram from a distance, automatic approach opened the crafting dialog while retaining the camera angle. No browser console errors in the inspected game and city views. Leon and other NPC positions are covered by the camera regression test; Leon was not manually clicked.
- Tests cover finite geometry, limb counts, independent animation state, attacks, death/revival and camera pitch across NPC locations/zoom levels.

Scorpion anatomy references:
- https://australian.museum/learn/species-identification/ask-an-expert/what-do-scorpions-look-like/
- https://research.amnh.org/users/lorenzo/PDF/Prendini.2006.McHill.Scorpions.pdf
