# Installer Plan

Ship the mod as a single `installer.exe` built with `deno compile`.

## Mechanism

Deno 2.1+ supports embedding arbitrary files into a compiled binary via `--include`. At runtime those files are
accessible relative to `import.meta.dirname`. The `--self-extracting` flag makes the binary extract all embedded files
to disk on first run, which is required because the GTA III data files need to land in real filesystem locations.

Reference: https://docs.deno.com/runtime/reference/cli/compile/

## Compile command

```
deno compile \
  --target x86_64-pc-windows-msvc \
  --self-extracting \
  --allow-read --allow-write --allow-env --allow-run \
  --icon assets/icon.ico \
  --include dist/tracks.dat \
  --include dist/tracks2.dat \
  --include dist/train.dat \
  --include dist/train2.dat \
  --output installer.exe \
  scripts/installer.ts
```

Add this as a `deno task build` in `deno.json`.

## Embedded artifacts

All mod artifacts live under `dist/` at compile time and are included via `--include`. The installer reads them via
`import.meta.dirname`:

```ts
const tracksData = Deno.readFileSync(import.meta.dirname + "/dist/tracks.dat");
```

At runtime (after self-extraction) these resolve to real paths the installer can copy into the user's GTA III directory.

## Installer script (scripts/installer.ts)

The installer should:

1. Ask the user for their GTA III install path (or read it from `.env.gta3` if present — re-use the detection logic from
   `scripts/find-gta3.ts`).
2. Back up existing `data/paths/*.dat` files before overwriting — same logic as `scripts/backup-tracks.ts`.
3. Copy each embedded artifact from `import.meta.dirname + "/dist/"` to the appropriate subdirectory in the GTA III
   install.
4. Print a success summary listing every file written.

## File mapping

| Embedded file    | Destination (relative to GTA3_DIR) |
| ---------------- | ---------------------------------- |
| dist/tracks.dat  | data/paths/tracks.dat              |
| dist/tracks2.dat | data/paths/tracks2.dat             |
| dist/train.dat   | data/paths/train.dat               |
| dist/train2.dat  | data/paths/train2.dat              |
| dist/vehicle.dff | models/gta3.img (via IMG tool)     |
| dist/vehicle.txd | models/gta3.img (via IMG tool)     |

IMG injection (for the vehicle model/texture) is deferred to Phase 4.

## Notes

- `--self-extracting` extracts to `%LOCALAPPDATA%\installer\<hash>\` on Windows on first run. Subsequent runs reuse the
  extracted directory.
- Do NOT use `--no-terminal` during development; remove the flag for the final release build only.
- Cross-compilation from any OS to `x86_64-pc-windows-msvc` is supported natively by `deno compile` with no extra
  toolchain needed.
