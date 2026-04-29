# Phase 2 — Track Data Modification

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

## 2.2 Author the Connector Track (`tracks3.dat`)

Planned route is in `.agents/plans/routing.md`. Key decisions to resolve first:

- [x] **Confirm the game does not crash with a third track file.** Test by adding a minimal `tracks3.dat` (3–4 nodes)
      and checking whether the game loads it without crashing.
- [ ] **Determine how to load the third track file.** If not supported, the connector must be appended to `tracks2.dat`
      after the existing subway nodes.
- [ ] **Confirm junction node** on the Portland El. The branch-off should be near `(963, 13, 22)` (northernmost El
      node). Walk the node sequence in `tracks.dat` to find the correct index so the counterclockwise direction is
      preserved.
- [ ] **Confirm Callahan Bridge deck height** in-game (estimated Z ≈ 12–15).

### Workflow

1. Copy `tracks.dat` from the backup as a starting reference.
2. Author new nodes by hand or with a script (see below) based on the waypoints in `phase-1/routing.md`.
3. Keep node spacing ~10–15 units (matching the existing files).
4. Mark station nodes with `stationType` 1 or 2 (left/right exit).
5. Save as `tracks3.dat` (or append to `tracks2.dat` if needed).
6. Drop the file into `GTA3/data/paths/` and load the game to test.

### Scripting approach

Rather than hand-editing, consider a Deno script (`scripts/generate-tracks.ts`) that takes a list of control points and
interpolates smooth node sequences at the correct spacing. This is more reliable than manual editing for long
cross-island routes. Add it as `deno task generate-tracks`.

---

## 2.3 Cinematic Camera Data (`train.dat` / `train2.dat`)

These files live in `data/paths/` alongside the track files. They are **not present in the Steam (Rockstar Games
Launcher) install** — the game silently skips cinematic mode when they are absent. Format is documented at
[gtamods.com/wiki/Train.dat](https://gtamods.com/wiki/Train.dat) and in `scripts/backup-tracks.ts`.

- `train.dat` — cinematic cameras for the Portland El
- `train2.dat` — cinematic cameras for the Shoreside subway

To add cinematic support for the new connector:

- [ ] Create `train.dat` and/or `train2.dat` from scratch (they do not exist to append to).
- [ ] Each node: cam position (X,Y,Z), target (X,Y,Z or 999,999,999), zone entry lower-left, zone entry upper-right, far
      clip, near clip.
- [ ] Max 800 camera nodes total per file.
- [ ] File format: comma-separated floats (newlines optional), terminated with a semicolon. Every 14 values = one camera
      node.

---

## 2.4 Validate & Iterate

- [ ] Load modified files in-game and ride the new route.
- [ ] Check for terrain clipping, broken segments, and incorrect station exits.
- [ ] Adjust node spacing if train speed feels wrong (closer = slower).
- [ ] Commit finalised `tracks3.dat` (and camera file) to `dist/` ready for the installer (see `installer.md`).
