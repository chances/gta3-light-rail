/**
 * Geometry utilities for GTA III track data.
 *
 * All coordinates are in meters (GTA3 world space).
 */

import type { TrackNode } from "./tracks.ts";

// ---------------------------------------------------------------------------
// Path closing
// ---------------------------------------------------------------------------

/**
 * Distance threshold (meters) below which the first and last nodes are
 * considered already coincident, so no extra node needs to be appended.
 */
const CLOSE_THRESHOLD_M = 0.01;

/**
 * Returns a node array that is guaranteed to form a closed loop.
 *
 * If the first and last nodes are already within {@link CLOSE_THRESHOLD_M}
 * of each other (XY plane), the original array is returned unchanged.
 * Otherwise a copy of the first node is appended so that the rendered SVG
 * path connects back to its start point.
 *
 * Only X and Y are compared; Z (elevation) is ignored for closure because
 * track loops may differ in elevation at the join point.
 */
export function closeTrackPath(nodes: TrackNode[]): TrackNode[] {
  if (nodes.length < 2) return nodes;

  const first = nodes[0];
  const last  = nodes[nodes.length - 1];

  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= CLOSE_THRESHOLD_M) return nodes; // already closed

  // Append a copy of the first node to close the loop
  return [...nodes, { ...first }];
}
