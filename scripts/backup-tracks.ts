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
import { join, dirname, fromFileUrl } from "@std/path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackNode {
  x: number;
  y: number;
  z: number;
  /** 0 = no station, 1 = left-side exit, 2 = right-side exit */
  stationType: number;
  stationName?: string;
}

interface TrackFile {
  nodeCount: number;
  nodes: TrackNode[];
  stations: TrackNode[];
}

interface CameraNode {
  // Fixed camera position
  camX: number; camY: number; camZ: number;
  // Point-at target (999,999,999 means "track the player's train")
  targetX: number; targetY: number; targetZ: number;
  // Zone of entry — lower-left and upper-right corners
  zoneLX: number; zoneLY: number; zoneLZ: number;
  zoneUX: number; zoneUY: number; zoneUZ: number;
  farClip: number;
  nearClip: number;
}

interface CameraFile {
  nodeCount: number;
  nodes: CameraNode[];
}

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
  const userProfile = Deno.env.get("USERPROFILE") ?? Deno.env.get("HOME") ?? ".";
  const defaultBackupDir = join(userProfile, "Documents", "GTA3", "Backups");
  const backupDir = env["GTA3_BACKUP_DIR"] ?? defaultBackupDir;

  return { dataDir, backupDir };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Parses a tracks*.dat file.
 *
 * Format (gtamods.com/wiki/Tracks.dat):
 *   Line 1:  <nodeCount>
 *   Lines 2+: <X> <Y> <Z> <stationType> [stationName]
 */
function parseTracksDat(text: string): TrackFile {
  // Strip comment lines (starting with #) and blank lines
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  const nodeCount = parseInt(lines[0], 10);
  const nodes: TrackNode[] = [];

  for (let i = 1; i <= nodeCount && i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    const node: TrackNode = {
      x: parseFloat(parts[0]),
      y: parseFloat(parts[1]),
      z: parseFloat(parts[2]),
      stationType: parseInt(parts[3] ?? "0", 10),
    };
    if (parts[4]) node.stationName = parts[4];
    nodes.push(node);
  }

  return {
    nodeCount,
    nodes,
    stations: nodes.filter((n) => n.stationType !== 0),
  };
}

/**
 * Parses a train*.dat file.
 *
 * Format (gtamods.com/wiki/Train.dat):
 *   A flat stream of comma-separated floats (newlines optional),
 *   terminated with a semicolon. Every 14 values define one camera node.
 */
function parseTrainDat(text: string): CameraFile {
  // Strip everything after the final semicolon, then split on commas/whitespace
  const body = text.split(";")[0];
  const tokens = body
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const FIELDS_PER_NODE = 14;
  const nodeCount = Math.floor(tokens.length / FIELDS_PER_NODE);
  const nodes: CameraNode[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const o = i * FIELDS_PER_NODE;
    nodes.push({
      camX:    parseFloat(tokens[o + 0]),
      camY:    parseFloat(tokens[o + 1]),
      camZ:    parseFloat(tokens[o + 2]),
      targetX: parseFloat(tokens[o + 3]),
      targetY: parseFloat(tokens[o + 4]),
      targetZ: parseFloat(tokens[o + 5]),
      zoneLX:  parseFloat(tokens[o + 6]),
      zoneLY:  parseFloat(tokens[o + 7]),
      zoneLZ:  parseFloat(tokens[o + 8]),
      zoneUX:  parseFloat(tokens[o + 9]),
      zoneUY:  parseFloat(tokens[o + 10]),
      zoneUZ:  parseFloat(tokens[o + 11]),
      farClip: parseFloat(tokens[o + 12]),
      nearClip: parseFloat(tokens[o + 13]),
    });
  }

  return { nodeCount, nodes };
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
