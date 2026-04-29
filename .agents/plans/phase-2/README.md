# Phase 2 — Track Data Modification

## Carried over from Phase 1

- [ ] **Visualize existing routes** in-game using:
  1. Launch the game and take the Portland El from the northernmost station
     south to confirm the full loop is intact.
  2. Take the Shoreside subway to confirm its loop.
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
- [ ] `train.dat` / `train2.dat` camera files — deferred (see `installer.md`)

---

## 2.2 Author the Connector Track (`tracks3.dat`)

Planned route is in `phase-1/routing.md`. Key decisions to resolve first:

- [ ] **Confirm engine supports a third track file.** Test by adding a minimal
  `tracks3.dat` (3–4 nodes) and checking whether the game loads it without
  crashing. If not supported, the connector must be appended to `tracks2.dat`
  after the existing subway nodes.
- [ ] **Confirm junction node** on the Portland El. The branch-off should be
  near `(963, 13, 22)` (northernmost El node). Walk the node sequence in
  `tracks.dat` to find the correct index so the counterclockwise direction
  is preserved.
- [ ] **Confirm Callahan Bridge deck height** in-game (estimated Z ≈ 12–15).

### Workflow

1. Copy `tracks.dat` from the backup as a starting reference.
2. Author new nodes by hand or with a script (see below) based on the
   waypoints in `phase-1/routing.md`.
3. Keep node spacing ~10–15 units (matching the existing files).
4. Mark station nodes with `stationType` 1 or 2 (left/right exit).
5. Save as `tracks3.dat` (or append to `tracks2.dat` if needed).
6. Drop the file into `GTA3/data/paths/` and load the game to test.

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

- [ ] Load modified files in-game and ride the new route.
- [ ] Check for terrain clipping, broken segments, and incorrect station exits.
- [ ] Adjust node spacing if train speed feels wrong (closer = slower).
- [ ] Commit finalised `tracks3.dat` (and camera file) to `dist/` ready for
  the installer (see `installer.md`).
