# Phase 5 — Testing & Refinement

## 5.0 Deferred from Phase 2

### Cinematic Camera Files (`train.dat` / `train2.dat`)

Backing up the original camera files was deferred during Phase 2. Complete
this before any camera data is authored or modified.

- [ ] Back up `train.dat` and `train2.dat` from `GTA3/data/paths/` using
  `scripts/backup-tracks.ts` (or a dedicated script if needed).
- [ ] Confirm whether the engine supports a third `train*.dat` file
  (same question as `tracks3.dat` — likely the same answer).

Format notes (from `scripts/backup-tracks.ts`):
- Each node: cam position (X,Y,Z), target (X,Y,Z or `999,999,999`),
  zone entry lower-left, zone entry upper-right, far clip, near clip.
- Max **800 nodes** total across the file.

---

## 5.1 Initial Load Test

- [ ] Verify the game loads without crashing with all modified/added files in place.
- [ ] Confirm the new connector route appears and trains spawn on it.

## 5.2 Track Functionality Tests

- [ ] Ride the full connector route from the Portland El junction to FIA.
- [ ] Check for terrain clipping, broken segments, and incorrect station exits.
- [ ] Verify counterclockwise travel direction is preserved at the junction node.

## 5.3 Gameplay Refinement

- [ ] Adjust node spacing if train speed feels wrong (closer = slower).
- [ ] Design and author camera nodes for the connector route (see §5.0 above).
- [ ] Tune station exit directions (`stationType` 1 vs 2) at each of the 5 stops.

## 5.4 Final Commit

- [ ] Commit finalised `tracks3.dat` (and camera file) to `dist/` ready for
  the installer (see `installer.md`).
