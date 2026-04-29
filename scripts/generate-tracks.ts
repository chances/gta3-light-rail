/**
 * Generates a tracks3.dat file for the Portland El → FIA light rail connector.
 *
 * Control points are defined inline below (derived from routing.md).
 * The script interpolates a smooth Catmull-Rom spline between them and
 * samples it at the target node spacing to produce a GTA III–compatible
 * tracks*.dat file.
 *
 * Usage:
 *   deno task generate-tracks [--out <path>] [--spacing <meters>] [--minimal]
 *
 *   --out      Output file path (default: dist/tracks3.dat)
 *   --spacing  Target node spacing in meters (default: 12)
 *   --minimal  Emit only 4 nodes — for testing whether the engine supports a
 *              third track file without crashing. Overrides --spacing.
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import { ensureDir } from "@std/fs/ensure-dir";
import { dirname } from "@std/path";
import { serializeTracksDat } from "../lib/tracks.ts";
import type { TrackNode } from "../lib/tracks.ts";

// ---------------------------------------------------------------------------
// Control points
// Derived from .agents/plans/routing.md — "Route Segments" section.
// Each entry is [x, y, z, stationType, stationName?].
// stationType: 0 = none, 1 = left exit, 2 = right exit
// ---------------------------------------------------------------------------

interface ControlPoint {
  x: number;
  y: number;
  z: number;
  stationType: number;
  stationName?: string;
}

/** Branch-off from the northernmost Portland El node and descend to FIA. */
const CONTROL_POINTS: ControlPoint[] = [
  // Branch-off point — junction with Portland El loop near (963, 13, 22)
  { x: 850, y: -50, z: 22, stationType: 0 },
  // Portland View / Sweeney station
  { x: 850, y: -200, z: 22, stationType: 1, stationName: "PortlandView" },
  // Descend westward toward Callahan Bridge
  { x: 730, y: -180, z: 18, stationType: 0 },
  // Callahan Junction — bridge deck level
  { x: 600, y: -180, z: 15, stationType: 2, stationName: "CallahanJunction" },
  // Cross to Staunton, descend to near-surface
  { x: 450, y: -190, z: 11, stationType: 0 },
  // Newport station — surface interchange with subway
  { x: 200, y: -200, z: 8, stationType: 1, stationName: "Newport" },
  // South along Staunton west coast
  { x: 100, y: -450, z: 7, stationType: 0 },
  // Cross Shoreside Lift Bridge
  { x: -20, y: -700, z: 7, stationType: 0 },
  // Shoreside Terminal station
  { x: -100, y: -900, z: 7, stationType: 2, stationName: "ShoresideTerminal" },
  // South through Pike Creek / Wichita Gardens
  { x: -130, y: -1200, z: 6, stationType: 0 },
  // FIA terminus
  { x: -150, y: -1630, z: 6, stationType: 1, stationName: "FIA" },
];

// ---------------------------------------------------------------------------
// Catmull-Rom spline interpolation
// ---------------------------------------------------------------------------

/**
 * Interpolates a single value along a Catmull-Rom segment.
 * p0, p1, p2, p3 are the four control scalars; t ∈ [0, 1].
 */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  // Standard Catmull-Rom matrix form (alpha = 0.5)
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
  );
}

/** 3D point. */
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Samples the Catmull-Rom spline through `points` at a uniform arc-length
 * spacing of `spacingM` meters.
 *
 * Ghost points are reflected at each end so that the spline passes through
 * the first and last control points.
 */
function sampleSpline(points: ControlPoint[], spacingM: number): Vec3[] {
  if (points.length < 2) return points.map(({ x, y, z }) => ({ x, y, z }));

  // Extend with reflected ghost points at each end
  const pts: ControlPoint[] = [
    reflectPoint(points[1], points[0]),
    ...points,
    reflectPoint(points[points.length - 2], points[points.length - 1]),
  ];

  const sampled: Vec3[] = [];
  let accumulated = 0; // meters along current segment since last sample

  // Walk each Catmull-Rom segment (between pts[i+1] and pts[i+2])
  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const p2 = pts[i + 2];
    const p3 = pts[i + 3];

    // Estimate segment length by sampling at coarse resolution
    const STEPS = 100;
    const stepPositions: Vec3[] = [];
    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS;
      stepPositions.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
      });
    }

    // Emit samples at every `spacingM` meters along arc length
    for (let s = 0; s < STEPS; s++) {
      const a = stepPositions[s];
      const b = stepPositions[s + 1];
      const segLen = dist3(a, b);

      let pos = accumulated;
      while (pos <= segLen) {
        const frac = segLen > 0 ? pos / segLen : 0;
        sampled.push(lerp3(a, b, frac));
        pos += spacingM;
      }
      accumulated = pos - segLen;
    }
  }

  // Always include the final control point
  const last = points[points.length - 1];
  sampled.push({ x: last.x, y: last.y, z: last.z });

  return sampled;
}

/** Reflects `source` through `pivot` to produce a ghost point. */
function reflectPoint(source: ControlPoint, pivot: ControlPoint): ControlPoint {
  return {
    x: 2 * pivot.x - source.x,
    y: 2 * pivot.y - source.y,
    z: 2 * pivot.z - source.z,
    stationType: 0,
  };
}

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

// ---------------------------------------------------------------------------
// Station node assignment
//
// After interpolation the raw Vec3 samples carry no station metadata.
// We snap each original control point that has stationType !== 0 to the
// nearest sampled node and mark it accordingly.
// ---------------------------------------------------------------------------

function assignStations(sampled: Vec3[], controlPoints: ControlPoint[]): TrackNode[] {
  const nodes: TrackNode[] = sampled.map(({ x, y, z }) => ({ x, y, z, stationType: 0 }));

  for (const cp of controlPoints) {
    if (cp.stationType === 0) continue;

    // Find the nearest sampled node to this control point (XY distance only)
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const dx = nodes[i].x - cp.x;
      const dy = nodes[i].y - cp.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    nodes[bestIdx].stationType = cp.stationType;
    if (cp.stationName) nodes[bestIdx].stationName = cp.stationName;
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Minimal test output (engine support check)
// ---------------------------------------------------------------------------

/** Returns a minimal 4-node straight segment for engine compatibility testing. */
function minimalNodes(): TrackNode[] {
  // Simple straight line using the first two control points
  const a = CONTROL_POINTS[0];
  const b = CONTROL_POINTS[1];
  return [
    { x: a.x, y: a.y, z: a.z, stationType: 0 },
    { x: a.x + (b.x - a.x) * 0.33, y: a.y + (b.y - a.y) * 0.33, z: a.z + (b.z - a.z) * 0.33, stationType: 0 },
    { x: a.x + (b.x - a.x) * 0.66, y: a.y + (b.y - a.y) * 0.66, z: a.z + (b.z - a.z) * 0.66, stationType: 0 },
    { x: b.x, y: b.y, z: b.z, stationType: 1, stationName: b.stationName },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(Deno.args, {
  string: ["out", "spacing"],
  boolean: ["minimal"],
  default: { out: "dist/tracks3.dat", spacing: "12", minimal: false },
});

const outPath = args.out as string;
const spacingM = parseFloat(args.spacing as string);
const useMinimal = args.minimal as boolean;

if (isNaN(spacingM) || spacingM <= 0) {
  console.error(`Invalid --spacing value: ${args.spacing}`);
  Deno.exit(1);
}

console.log(useMinimal ? "Mode: minimal (engine support test)" : `Mode: full route  spacing=${spacingM} m`);

const nodes: TrackNode[] = useMinimal
  ? minimalNodes()
  : assignStations(sampleSpline(CONTROL_POINTS, spacingM), CONTROL_POINTS);

console.log(`Nodes generated : ${nodes.length}`);
console.log(`Stations        : ${nodes.filter((n) => n.stationType !== 0).length}`);

await ensureDir(dirname(outPath));
await Deno.writeTextFile(outPath, serializeTracksDat(nodes));
console.log(`Written → ${outPath}`);
