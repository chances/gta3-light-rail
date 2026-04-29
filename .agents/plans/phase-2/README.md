# Phase 2 — Track Data Modification

## Tools

**KEd** is the primary survey and authoring tool for this phase. It renders
the full Liberty City map in 3D, draws `tracks.dat` PATH node chains as linked
points, and lets you move nodes with the mouse — no in-game launch required
for most tasks. In-game validation is reserved for §2.4.

- Download: GTAForums / Internet Archive (search `KEd JernejL GTA III map editor`)
- Supports: GTA III, GTA VC
- Key features used here: 3D PATH node viewer, orthographic overhead view,
  collision geometry rendering, radar map overlay

---

## Carried over from Phase 1

- [x] **Visualize existing routes** using KEd:
  1. Load the GTA III install in KEd and inspect `tracks.dat` and `tracks2.dat`
     node chains in the 3D view.
  2. Confirm the Portland El loop and Shoreside subway loop are intact and
     match the extents documented in `routing.md`.
  3. Cross-check the start/end coordinates of each loop against the node
     coordinates documented in `phase-1/routing.md`.
  This is observational — no file changes needed, just a sanity check before
  authoring new nodes.

---

## 2.1 Backup Original Files

Already done via `scripts/backup-tracks.ts`. Backups are in
`%USERPROFILE%\Documents\GTA3\Backups` (or `GTA3_BACKUP_DIR` from `.env.gta3`).

- [x] `tracks.dat` backed up
- [x] `tracks2.dat` backed up
- [ ] `train.dat` / `train2.dat` camera files — deferred to Phase 5 (see `.agents/plans/phase-5/README.md`)

---

## 2.2 Author the Connector Track (`tracks3.dat`)

Planned route is in `phase-1/routing.md`. Key decisions to resolve first:

- [x] **Confirm engine supports a third track file.** Test by adding a minimal
  `tracks3.dat` (3–4 nodes) and checking whether the game loads it without
  crashing. If not supported, the connector must be appended to `tracks2.dat`
  after the existing subway nodes.
- [ ] **Confirm junction node** on the Portland El using KEd. Open `tracks.dat`
  in KEd's PATH viewer, locate the node nearest `(963, 13, 22)` (northernmost
  El node), and note its index. Verify the counterclockwise direction is
  preserved by checking the preceding and following nodes in the sequence.
- [ ] **Confirm Callahan Bridge deck height** using KEd. Switch to orthographic
  overhead view, fly to the Callahan Bridge, and read the Z coordinate of the
  bridge deck geometry (estimated Z ≈ 12–15). Note the confirmed value for
  use in the Callahan Junction station node.

### Workflow

1. Copy `tracks.dat` from the backup as a starting reference.
2. Author new nodes by hand or with a script (see below) based on the
   waypoints in `phase-1/routing.md`.
3. Keep node spacing ~10–15 units (matching the existing files).
4. Mark station nodes with `stationType` 1 or 2 (left/right exit).
5. Save as `tracks3.dat` (or append to `tracks2.dat` if needed).
6. Load the file into KEd and inspect the new node chain against the Liberty
   City map geometry — check for obvious terrain conflicts and verify the
   route follows the intended alignment before touching the game install.
7. Drop the file into `GTA3/data/paths/` and proceed to §2.4 for in-game
   validation.

### Scripting approach

Rather than hand-editing, consider a Deno script (`scripts/generate-tracks.ts`)
that takes a list of control points and interpolates smooth node sequences
at the correct spacing. This is more reliable than manual editing for long
cross-island routes. Add it as `deno task generate-tracks`.

---

## 2.3 Cinematic Camera Data (`train.dat` / `train2.dat`)

Deferred from Phase 1. Format is documented in `scripts/backup-tracks.ts`.

- [ ] Design camera nodes for the new connector route.
- [ ] Each node: cam position (X,Y,Z), target (X,Y,Z or 999,999,999),
  zone entry lower-left, zone entry upper-right, far clip, near clip.
- [ ] Append new nodes to `train.dat` or create `train3.dat` (subject to
  same engine support question as tracks).
- [ ] Max 800 nodes total across the file.

---

## 2.4 Validate & Iterate

In-game validation happens here — only after the KEd survey in §2.2 has
cleared the route of obvious geometry conflicts.

- [ ] Drop `tracks3.dat` into `GTA3/data/paths/` and launch the game.
- [ ] Ride the full connector route from the Portland El junction to FIA.
- [ ] Check for terrain clipping, broken segments, and incorrect station exits.
- [ ] Return to KEd to adjust any problem nodes, then re-test in-game.
- [ ] Adjust node spacing if train speed feels wrong (closer = slower).
- [ ] Commit finalised `tracks3.dat` (and camera file) to `dist/` ready for
  the installer (see `installer.md`).
