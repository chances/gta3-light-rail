/**
 * Shared types and parsers for GTA III track and camera data files.
 *
 * Formats documented at:
 *   gtamods.com/wiki/Tracks.dat
 *   gtamods.com/wiki/Train.dat
 *
 * Coordinate system: GTA3 world space.
 *   X = East (+) / West (−)
 *   Y = North (+) / South (−)   ← increases northward; negate for screen-Y
 *   Z = Up
 * Units are meters. Liberty City spans roughly −2000 m to +2000 m on each axis.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackNode {
  x: number;
  y: number;
  z: number;
  /** 0 = no station, 1 = left-side exit, 2 = right-side exit */
  stationType: number;
  stationName?: string;
}

export interface TrackFile {
  /** Node count declared in the file header. */
  nodeCount: number;
  nodes: TrackNode[];
  /** Subset of nodes where stationType !== 0. */
  stations: TrackNode[];
}

export interface CameraNode {
  // Fixed camera position (meters)
  camX: number;
  camY: number;
  camZ: number;
  // Point-at target; (999, 999, 999) means "track the player's train"
  targetX: number;
  targetY: number;
  targetZ: number;
  // Trigger zone — lower-left and upper-right corners (meters)
  zoneLX: number;
  zoneLY: number;
  zoneLZ: number;
  zoneUX: number;
  zoneUY: number;
  zoneUZ: number;
  /** Far clip plane distance (meters) */
  farClip: number;
  /** Near clip plane distance (meters) */
  nearClip: number;
}

export interface CameraFile {
  /** Node count inferred from token stream length. */
  nodeCount: number;
  nodes: CameraNode[];
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
 *
 * All coordinates are in meters (GTA3 world space).
 */
export function parseTracksDat(text: string): TrackFile {
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
 * Serializes an array of track nodes to a tracks*.dat string.
 *
 * Format (gtamods.com/wiki/Tracks.dat):
 *   Line 1:  <nodeCount>
 *   Lines 2+: <X> <Y> <Z> <stationType> [stationName]
 *
 * Coordinates are written to 4 decimal places. stationName is omitted when
 * absent or empty.
 */
export function serializeTracksDat(nodes: TrackNode[]): string {
  const lines: string[] = [String(nodes.length)];
  for (const n of nodes) {
    let line = `${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)} ${n.stationType}`;
    if (n.stationName) line += ` ${n.stationName}`;
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Parses a train*.dat file.
 *
 * Format (gtamods.com/wiki/Train.dat):
 *   A flat stream of comma-separated floats (newlines optional),
 *   terminated with a semicolon. Every 14 values define one camera node.
 *
 * All coordinates are in meters (GTA3 world space).
 */
export function parseTrainDat(text: string): CameraFile {
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
      camX: parseFloat(tokens[o + 0]),
      camY: parseFloat(tokens[o + 1]),
      camZ: parseFloat(tokens[o + 2]),
      targetX: parseFloat(tokens[o + 3]),
      targetY: parseFloat(tokens[o + 4]),
      targetZ: parseFloat(tokens[o + 5]),
      zoneLX: parseFloat(tokens[o + 6]),
      zoneLY: parseFloat(tokens[o + 7]),
      zoneLZ: parseFloat(tokens[o + 8]),
      zoneUX: parseFloat(tokens[o + 9]),
      zoneUY: parseFloat(tokens[o + 10]),
      zoneUZ: parseFloat(tokens[o + 11]),
      farClip: parseFloat(tokens[o + 12]),
      nearClip: parseFloat(tokens[o + 13]),
    });
  }

  return { nodeCount, nodes };
}

// ---------------------------------------------------------------------------
// Bounding box helper
// ---------------------------------------------------------------------------

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Returns the XYZ bounding box of a set of track nodes (in meters). */
export function trackBounds(nodes: TrackNode[]): BoundingBox {
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const zs = nodes.map((n) => n.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}
