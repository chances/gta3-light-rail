# Phase 2 — Track Data Modification

## Design Decisions

The key architectural choices — extending `tracks2.dat` instead of introducing a third track file, and using a CLEO
Redux TypeScript plugin instead of a compiled ASI — are documented in `asset-loading-research.md`.

> The state of the codebase at the point these decisions were finalised is preserved at
> [`1850e5ff`](https://github.com/chances/gta3-light-rail/tree/1850e5ff5818fea2366dfb805470498d56132062).

## Tools

**KEd** is the primary survey and authoring tool for this phase. It renders the full Liberty City map in 3D, draws
`tracks.dat` PATH node chains as linked points, and lets you move nodes with the mouse — no in-game launch required for
most tasks. In-game validation is reserved for §2.4.

- Download: GTAForums / Internet Archive (search `KEd JernejL GTA III map editor`)
- Supports: GTA III, GTA VC
- Key features used here: 3D PATH node viewer, orthographic overhead view, collision geometry rendering, radar map
  overlay

---

## Carried over from Phase 1

- [x] **Visualize existing routes** using KEd:
  1. Load the GTA III install in KEd and inspect `tracks.dat` and `tracks2.dat` node chains in the 3D view.
  2. Confirm the Portland El loop and Shoreside subway loop are intact and match the extents documented in `routing.md`.
  3. Cross-check the start/end coordinates of each loop against the node coordinates documented in `phase-1/routing.md`.
     This is observational — no file changes needed, just a sanity check before authoring new nodes.

---

## 2.1 Backup Original Files (Done)

Already done via `scripts/backup-tracks.ts`. Backups are in `%USERPROFILE%\Documents\GTA3\Backups` (or `GTA3_BACKUP_DIR`
from `.env.gta3`).

- [x] `tracks.dat` backed up
- [x] `tracks2.dat` backed up
- [ ] `train.dat` / `train2.dat` camera files (Deferred to Phase 5)

  Absent from the Steam install (the Rockstar Games Launcher version omits them). They are optional; the game runs
  without them but cinematic mode will not activate. Create from scratch if cinematic camera support is desired (see
  §2.3).

---

## 2.2 Route Survey

Before authoring any nodes, pin down the five coordinates / geometry facts that are still open (see `routing.md`
questions 1–3, 6–7). **Prefer a map editor** over in-game walking — MEd or a similar GTA III world viewer lets you click
geometry and read world-space XYZ directly without need for a coordinate-display cheat. Fall back to in-game surveying
via the CLEO Redux plugin (log `GET_PLAYER_COORDINATES` to the console) only if the map editor cannot provide a reading.

- [ ] **Q1 — El junction node.** In MEd (or `tracks.dat` directly), walk the node sequence around the major road between
      Chinatown and Portland View. Identify the last El node before the road crossing on the southbound
      (counterclockwise) side. Record its index and XYZ — this is the fork point; the new branch departs from the very
      next node slot.

- [ ] **Q2 — Callahan Bridge deck height.** Open the Callahan Bridge in the map editor and read the Z of the road
      surface at mid-span. Confirm the approach grades on both the Portland and Staunton sides ramp smoothly from street
      level (~7–8) to deck level. Record the exact Z so the bridge-crossing nodes can be authored precisely.

- [ ] **Q3 — Staunton Island crossing median width.** In the map editor, inspect the east–west avenue that the alignment
      follows from the Callahan Bridge to the west-edge T-junction. Determine whether the painted median is wide enough
      for a single at-grade track (ideally ≥ 4 units), or whether the alignment must share the kerb lane with traffic
      instead. Note the avenue's Y coordinate for use as the constant Y value across the Staunton crossing segment.

- [ ] **Q6 — Shoreside Vale highway curve and FIA access road.** Trace the avenue / highway in the map editor from the
      Shoreside Lift Bridge southward. Record: 1. The approximate XY where the highway curves north. 2. The XY of the
      intersection with the FIA access road (the turn-west waypoint). These two points define the shape of the final
      approach segment.

- [ ] **Q7 — FIA terminal station site.** Survey the FIA apron perimeter (preferably in the map editor; otherwise on
      foot in-game) to find a spot within comfortable walking distance of the main terminal entrance. Record the XYZ of
      the proposed platform centre. This becomes the terminal node for the FIA Terminal station.

---

## 2.3 Author the Connector Track (`tracks2.dat`)

The new alignment is **electrified** — overhead catenary wire runs the full length of the route. Node Z values must
account for the alignment type at each segment:

| Segment                                                 | Alignment                              | Approx. Z |
| ------------------------------------------------------- | -------------------------------------- | --------- |
| El junction (Chinatown / Portland View major road)      | Elevated, branch off El viaduct        | ~21–22    |
| Branch descent south to Callahan Bridge avenue          | Ramp down from viaduct to street grade | ~22 → ~7  |
| Callahan Bridge avenue westward (at-grade median)       | At-grade median                        | ~7–8      |
| Callahan Bridge crossing                                | Bridge deck                            | ~12–15    |
| Staunton Island crossing (east edge → west edge avenue) | At-grade median (or with traffic)      | ~7–8      |
| Staunton west edge avenue, turning north                | At-grade                               | ~7–8      |
| Shoreside Lift Bridge crossing                          | Bridge deck (à la Steel Bridge, PDX)   | ~12–15    |
| Shoreside Vale avenue / highway (curves north to FIA)   | At-grade highway median                | ~6–7      |
| FIA terminal approach (future alignment)                | At-grade, turns west to terminal       | ~5–6      |

Planned route is in `.agents/research/routing.md`. Key decisions to resolve first:

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

- [ ] **Confirm junction node** on the Portland El. The branch-off should be on the major road between Chinatown and
      Portland View — roughly where the El viaduct crosses that street. Walk the node sequence in `tracks.dat` to find
      the correct index; the branch must depart the El loop in the counterclockwise direction, and the descent ramp to
      street grade begins immediately south of the junction node.
- [ ] **Confirm Callahan Bridge deck height** in-game (estimated Z ≈ 12–15).
- [x] **Confirm engine supports a third track file.** Test by adding a minimal `tracks3.dat` (3–4 nodes) and checking
      whether the game loads it without crashing. If not supported, the connector must be appended to `tracks2.dat`
      after the existing subway nodes.
- [ ] **Confirm junction node** on the Portland El using KEd. Open `tracks.dat` in KEd's PATH viewer, locate the node
      nearest `(963, 13, 22)` (northernmost El node), and note its index. Verify the counterclockwise direction is
      preserved by checking the preceding and following nodes in the sequence.
- [ ] **Confirm Callahan Bridge deck height** using KEd. Switch to orthographic overhead view, fly to the Callahan
      Bridge, and read the Z coordinate of the bridge deck geometry (estimated Z ≈ 12–15). Note the confirmed value for
      use in the Callahan Junction station node.

### Workflow

1. Copy `tracks2.dat` from the backup as a starting reference.
2. Author new nodes by hand or with a script (see below) based on the waypoints in `routing.md`.
3. Keep node spacing ~10–15 units (matching the existing file).
4. Mark station nodes with `stationType` 1 or 2 (left/right exit).
5. Append the new nodes to the end of `tracks2.dat`.
6. Load the file into KEd and inspect the new node chain against the Liberty City map geometry — check for obvious
   terrain conflicts and verify the route follows the intended alignment before touching the game install.
7. Drop the file into `GTA3/data/paths/` and proceed to §2.4 for in-game validation.

### Scripting approach

Rather than hand-editing, consider a Deno script (`scripts/generate-tracks.ts`) that takes a list of control points and
interpolates smooth node sequences at the correct spacing. This is more reliable than manual editing for long
cross-island routes. Add it as `deno task generate-tracks`.

---

## 2.4 Validate & Iterate

In-game validation happens here — only after the KEd survey in §2.2 has cleared the route of obvious geometry conflicts.

- [ ] Drop `tracks3.dat` into `GTA3/data/paths/` and launch the game.
- [ ] Ride the full connector route from the Portland El junction to FIA.
- [ ] Check for terrain clipping, broken segments, and incorrect station exits.
- [ ] Return to KEd to adjust any problem nodes, then re-test in-game.
- [ ] Adjust node spacing if train speed feels wrong (closer = slower).
- [ ] Commit finalised `tracks2.dat` to `dist/` ready for the installer (see `installer.md`).
