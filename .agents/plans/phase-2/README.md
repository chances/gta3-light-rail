# Phase 2 — Track Data Modification

## Design Decisions

The key architectural choices — extending `tracks2.dat` instead of introducing a third track file, and using a CLEO
Redux TypeScript plugin instead of a compiled ASI — are documented in `asset-loading-research.md`.

> The state of the codebase at the point these decisions were finalised is preserved at
> [`1850e5ff`](https://github.com/chances/gta3-light-rail/tree/1850e5ff5818fea2366dfb805470498d56132062).

---

## Carried over from Phase 1

- [x] **Visualize existing routes** using a new tool:
  1. See `tools/visualizer.html`.
  2. Launch the game and take the Portland El from the northernmost station south to confirm the full loop is intact.
  3. Take the Shoreside subway to confirm its loop.
  4. Cross-check the start/end coordinates of each loop against the node coordinates documented in `phase-1/routing.md`.
     This is observational, just a sanity check before authoring new nodes.

---

## 2.1 Backup Original Files (Done)

Already done via `scripts/backup-tracks.ts`. Backups are in `%USERPROFILE%\Documents\GTA3\Backups` (or `GTA3_BACKUP_DIR`
from `.env.gta3`).

- [x] `tracks.dat` backed up
- [x] `tracks2.dat` backed up
- [ ] `train.dat` / `train2.dat` camera files

  Absent from the Steam install (the Rockstar Games Launcher version omits them). They are optional; the game runs
  without them but cinematic mode will not activate. Create from scratch if cinematic camera support is desired (see
  §2.3).

---

## 2.2 Author the Connector Track (`tracks2.dat`)

The new alignment is **electrified** — overhead catenary wire runs the full length of the route. Node Z values must
account for the alignment type at each segment:

| Segment                           | Alignment                         | Approx. Z |
| --------------------------------- | --------------------------------- | --------- |
| Portland View → Callahan Junction | Elevated viaduct (shared with El) | ~21–22    |
| Callahan Junction                 | Bridge deck                       | ~12–15    |
| Newport → Shoreside Terminal      | At-grade surface                  | ~7–8      |
| Shoreside Terminal → FIA          | At-grade surface                  | ~6–7      |

Planned route is in `.agents/plans/routing.md`. Key decisions to resolve first:

- [x] **Confirm the game does not crash with a third track file.** Test by adding a minimal `tracks3.dat` (3–4 nodes)
      and checking whether the game loads it without crashing.
- [ ] **Determine how to load the third track file in-game.**

  1. [x] Scaffold a Cleo Redux plugin named "light-rail" implemented in TypeScript.
  2. [x] Research HOW to load new assets — see `asset-loading-research.md`

  **Findings summary:**
  - **Models/textures**: Must be pre-installed in a registered IMG archive + IDE entry. CLEO Redux can `REQUEST_MODEL` /
    `RELEASE_MODEL` at runtime, but cannot bootstrap an asset into the streaming system from an arbitrary file path at
    runtime.
  - **Spawn new train models**: Zero scripting opcodes for train creation. All 13 wagons (5 El + 8 Subway) are permanent
    entities spawned once at game init. Replacing the existing model ID 197 (`"train"`) with a custom DFF is the
    lowest-friction visual change.
  - **Load `tracks3.dat`**: Engine hardcodes exactly 2 track files. No extension point exists. Patching it to support a
    3rd track requires a C++ ASI plugin; doing it from CLEO Redux JS is technically possible but equivalent in
    complexity to a compiled ASI.
  - **Start trains on new tracks**: `m_nTrackId` byte at `CTrain* + 0x29C` controls which track each wagon follows (0 =
    El, 1 = Subway). Writeable via `WRITE_MEMORY`, but `ProcessControl()` must also be patched to handle value `2` — ASI
    territory.

  **Decision: extend `tracks2.dat` instead of introducing a 3rd file.** Append the new light rail nodes to the existing
  subway file. The TypeScript plugin handles station detection (`m_nCurTrackNode`), speed control (`m_fSpeed`), and
  HUD/UI entirely in script space — no memory patching or companion ASI required.

  > Architecture research and the full decision tree are preserved at
  > [`1850e5ff`](https://github.com/chances/gta3-light-rail/tree/1850e5ff5818fea2366dfb805470498d56132062) in
  > [`asset-loading-research.md`](https://github.com/chances/gta3-light-rail/blob/1850e5ff5818fea2366dfb805470498d56132062/.agents/plans/phase-2/asset-loading-research.md)
  > and
  > [`asi-plugin-d-lang.md`](https://github.com/chances/gta3-light-rail/blob/1850e5ff5818fea2366dfb805470498d56132062/.agents/plans/phase-2/asi-plugin-d-lang.md).

- [ ] **Confirm junction node** on the Portland El. The branch-off should be near `(963, 13, 22)` (northernmost El
      node). Walk the node sequence in `tracks.dat` to find the correct index so the counterclockwise direction is
      preserved.
- [ ] **Confirm Callahan Bridge deck height** in-game (estimated Z ≈ 12–15).

### Workflow

1. Copy `tracks2.dat` from the backup as a starting reference.
2. Author new nodes by hand or with a script (see below) based on the waypoints in `routing.md`.
3. Keep node spacing ~10–15 units (matching the existing file).
4. Mark station nodes with `stationType` 1 or 2 (left/right exit).
5. Append the new nodes to the end of `tracks2.dat`.
6. Drop the file into `GTA3/data/paths/` and load the game to test.

### Scripting approach

Rather than hand-editing, consider a Deno script (`scripts/generate-tracks.ts`) that takes a list of control points and
interpolates smooth node sequences at the correct spacing. This is more reliable than manual editing for long
cross-island routes. Add it as `deno task generate-tracks`.

---

## 2.3 Validate & Iterate

- [ ] Load modified files in-game and ride the new route.
- [ ] Check for terrain clipping, broken segments, and incorrect station exits.
- [ ] Adjust node spacing if train speed feels wrong (closer = slower).
- [ ] Commit finalised `tracks2.dat` to `dist/` ready for the installer (see `installer.md`).
