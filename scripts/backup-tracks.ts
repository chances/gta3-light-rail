/**
 * Backs up GTA III track and camera data files, then dumps a human-readable
 * summary of each file's node layout.
 *
 * Files backed up:
 *   tracks.dat  — Portland El waypoints       (gtamods.com/wiki/Tracks.dat)
 *   tracks2.dat — Subway waypoints            (gtamods.com/wiki/Tracks.dat)
 *   train.dat   — Portland El camera nodes    (gtamods.com/wiki/Train.dat)
 *   train2.dat  — Subway camera nodes         (gtamods.com/wiki/Train.dat)
 *
 * Configuration (via .env.gta3 in the project root):
 *   GTA3_DATA: path to GTA III's data/paths folder
 *   GTA3_BACKUP_DIR: override the default backup destination
 *
 * Default backup destination: %USERPROFILE%\Documents\GTA3\Backups
 */

import { parse as parseEnv } from "@std/dotenv";
import { copy } from "@std/fs/copy";
import { ensureDir } from "@std/fs/ensure-dir";
import { exists } from "@std/fs/exists";
import { dirname, fromFileUrl, join } from "@std/path";
import { parseTracksDat, parseTrainDat } from "../lib/tracks.ts";
import type { CameraFile, TrackFile } from "../lib/tracks.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ROOT = dirname(dirname(fromFileUrl(import.meta.url)));
const ENV_PATH = join(PROJECT_ROOT, ".env.gta3");

async function loadConfig(): Promise<{
  dataDir: string;
  backupDir: string;
}> {
  let env: Record<string, string> = {};
  if (await exists(ENV_PATH)) {
    env = parseEnv(await Deno.readTextFile(ENV_PATH));
  }

  const dataDir = env["GTA3_DATA"] ?? "";
  if (!dataDir) {
    console.error(
      "GTA3_DATA not set. Run scripts/find-gta3.ts first to generate .env.gta3",
    );
    Deno.exit(1);
  }

  // Default backup dir: %USERPROFILE%\Documents\GTA3\Backups
  const userProfile = Deno.env.get("USERPROFILE") ?? Deno.env.get("HOME") ??
    ".";
  const defaultBackupDir = join(userProfile, "Documents", "GTA3", "Backups");
  const backupDir = env["GTA3_BACKUP_DIR"] ?? defaultBackupDir;

  return { dataDir, backupDir };
}

// ---------------------------------------------------------------------------
// Dump helpers
// ---------------------------------------------------------------------------

function dumpTrack(name: string, tf: TrackFile): void {
  console.log(`\n${name}`);
  console.log(`  Nodes   : ${tf.nodes.length} (Expected ${tf.nodeCount})`);
  console.log(`  Stations: ${tf.stations.length}`);

  if (tf.stations.length > 0) {
    console.log("  Station list:");
    for (const s of tf.stations) {
      const exit = s.stationType === 1 ? "left" : "right";
      const label = s.stationName ? ` "${s.stationName}"` : "";
      console.log(
        `    ${exit}-exit${label}  @ (${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)})`,
      );
    }
  }

  // Bounding box gives a rough sense of the track's extent in world space
  const xs = tf.nodes.map((n) => n.x);
  const ys = tf.nodes.map((n) => n.y);
  const zs = tf.nodes.map((n) => n.z);
  console.log(
    `  X range : ${Math.min(...xs).toFixed(2)} → ${Math.max(...xs).toFixed(2)}`,
  );
  console.log(
    `  Y range : ${Math.min(...ys).toFixed(2)} → ${Math.max(...ys).toFixed(2)}`,
  );
  console.log(
    `  Z range : ${Math.min(...zs).toFixed(2)} → ${Math.max(...zs).toFixed(2)}`,
  );
}

function dumpCamera(name: string, cf: CameraFile): void {
  console.log(`\n=== ${name} ===`);
  console.log(`  Camera nodes: ${cf.nodeCount}`);

  // Count how many nodes track the train vs. fixed targets
  const trainTracking = cf.nodes.filter(
    (n) => n.targetX === 999 && n.targetY === 999 && n.targetZ === 999,
  ).length;
  console.log(
    `  Train-tracking nodes : ${trainTracking}`,
  );
  console.log(
    `  Fixed-target nodes   : ${cf.nodeCount - trainTracking}`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const TRACK_FILES = ["tracks.dat", "tracks2.dat"] as const;

async function main(): Promise<void> {
  const { dataDir, backupDir } = await loadConfig();

  console.log(`Source : ${dataDir}`);
  console.log(`Backup : ${backupDir}\n`);

  // Verify source files exist before touching anything
  for (const file of TRACK_FILES) {
    const src = join(dataDir, "paths", file);
    if (!await exists(src)) {
      console.error(`Missing source file: ${src}`);
      Deno.exit(1);
    }
  }

  // Create backup directory (including any missing parents)
  await ensureDir(backupDir);

  // Copy each file, skipping if an identical backup already exists
  for (const file of TRACK_FILES) {
    const src = join(dataDir, "paths", file);
    const dest = join(backupDir, file);
    if (await exists(dest)) {
      console.log(`  [skip]\t${file}\t(Backup already exists)`);
    } else {
      await copy(src, dest);
      console.log(`  ${file}`);
    }
  }

  // Parse and dump each file's structure
  console.log("\nNode Layout:");
  for (const file of TRACK_FILES) {
    const text = await Deno.readTextFile(join(dataDir, "paths", file));
    dumpTrack(file, parseTracksDat(text));
  }
  console.log();
}

await main();
