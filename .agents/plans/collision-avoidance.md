# Train Collision Avoidance — Design Analysis

Design analysis for the ASI plugin that manages the light rail fleet on `tracks3.dat`
and prevents collisions on the segment shared with the Portland El (`tracks.dat`).

The engine context is GTA III 1.0 US (re3-verified): trains are fixed-path autonomous
objects with **no native collision detection or inter-train awareness**.

---

## 1. Block Signaling (Railway Interlocking Basics)

### 1.1 How Real-World Block Signaling Works

The classical **absolute block system** divides a line into fixed segments called
*blocks*, bounded by signals or station limits. The fundamental rule is:

> Only one train is permitted inside a block at any time.

Signals show one of three indications:

| Aspect | Meaning |
| --- | --- |
| **Red / Danger** | Stop — the block ahead is occupied |
| **Yellow / Caution** | Proceed with reduced speed; prepare to stop before the next signal |
| **Green / Clear** | Proceed at line speed |

A block transitions from Occupied → Clear only after the *rear* of the train has
passed the exit signal **and** the signal has been reset by the signaler (or track
circuit).

**Interlocking** is a higher-level layer that locks signals and switch positions into
mutually consistent states so no two conflicting routes can be set simultaneously.
In our context there are no powered switches (trains run fixed loops), so interlocking
reduces to: *ensure only one block occupant at a time on any shared segment.*

**Moving block** (modern ETCS Level 3): trains report their position continuously;
the "block" is a virtual envelope around each train, not a fixed geographic segment.
This is conceptually closer to the world-space distance algorithm described in §2.2,
but requires reliable position telemetry — which we have via `m_nCurTrackNode` +
`m_fWagonPosition`.

### 1.2 Minimum Viable Software Block System (Game Context)

The simplest workable design for a single-threaded tick function is a **fixed-block
absolute system with a look-ahead warning tier**, implemented as a flat occupancy
array:

```
BlockSystem.Update() — called once per game tick, no threads, no sleeps
─────────────────────────────────────────────────────────────────────────
1.  Clear all blockOccupant[] entries to UNOCCUPIED.
2.  For each managed wagon W (all tracks):
      blockOccupant[W.currentBlock] = W.wagonId
3.  For each managed light rail wagon L:
      nodesAhead ← distance (in nodes) from L.curNode to the next
                   occupied block boundary in L's direction of travel
      L.targetSpeed ← speedForDistance(nodesAhead)   // see §4
      L.m_fSpeed ← smoothApproach(L.m_fSpeed, L.targetSpeed)
      write L.m_fSpeed back to CTrain* + 0x294
```

Complexity: O(W + L × B) per tick where W = total wagon count, L = LR wagon count,
B = number of blocks. At W = 17, L = 4, B = 24 this is negligible on any CPU that
can run GTA III.

### 1.3 Defining Blocks on a Node-Based Track

A *block* in node-index space is a contiguous half-open range `[firstNode, lastNode]`
on one track file. Boundaries must be placed at:

1. **Station platforms** — natural dwell / stop points; a train already stopped is a
   safe block boundary.
2. **Junction entry/exit nodes** — any node where two track-file geometries coincide.
3. **Midpoints between stations** for long inter-station gaps (> 25 nodes ≈ 300 m) to
   allow a second train to queue without crowding the platform.

At 12 m/node spacing, a comfortable block length is **12–20 nodes (144–240 m)**.
Approach and platform blocks can be shorter (8–12 nodes) because trains slow down
entering them anyway.

---

## 2. Shared Track Segment Problem

### 2.1 Junction Topology

The Portland El (`tracks.dat`, 168 nodes) runs counterclockwise. Its northernmost
node is **index 0** (or whichever index the file places nearest `(963.3, 13.1, 21.9)`;
verify by walking the array — see routing.md, "Junction geometry" open question).

The light rail (`tracks3.dat`) branches off at or near this node. Because GTA III
track files are separate node arrays, geometrically coincident nodes are **logically
independent** — each file has its own index space, and `CTrain::ProcessControl()`
advances each wagon along its own array without any awareness of the other.

This creates a dual-referencing problem:

```
tracks.dat index 0  →  world (963.3, 13.1, 21.9)  ← same point in space
tracks3.dat index 0 →  world (963.3, 13.1, 21.9)  ←
```

An El wagon at `tracks.dat[2]` and an LR wagon at `tracks3.dat[2]` may be at
**identical world coordinates**; the engine places both there simultaneously and
renders them overlapping — a visible collision.

The shared segment extends from the branch-off node until the two lines geometrically
diverge. Based on the route plan, this is approximately **nodes 0–12 on the El** and
**nodes 0–8 on the light rail** (both files start at the junction before diverging).
Verify exact node counts by comparing world coordinates during Phase 2.

### 2.2 World-Space Proximity Algorithm

For segments where node indices cannot be directly compared (because the two files
have different sampling densities near the junction), use world-space proximity as a
fallback:

```
SharedSegmentProximityCheck() — per tick
─────────────────────────────────────────────────────────────────────
Inputs:
  el_wagons[]   — El wagon WagonState array (El: tracks.dat, 5 wagons)
  lr_wagons[]   — LR wagon WagonState array (LR: tracks3.dat, 4 wagons)
  PROX_SQ       — squared proximity threshold; (20 m)² = 400 is conservative

Per tick:
  for each El wagon E:
    E.worldPos = lerp(
      elNodes[E.curNode],
      elNodes[(E.curNode + 1) % EL_NODE_COUNT],
      E.wagonPos
    )

  for each LR wagon L:
    L.worldPos = lerp(
      lrNodes[L.curNode],
      lrNodes[(L.curNode + 1) % LR_NODE_COUNT],
      L.wagonPos
    )

  for each pair (E, L):
    if distSq(E.worldPos, L.worldPos) < PROX_SQ:
      // El has right-of-way; LR yields unconditionally
      L.targetSpeed = 0.0f

  // Do NOT slow E — that would break the stock game's train schedule
```

This runs in O(E × L) = O(5 × 4) = 20 comparisons per tick — negligible.

**Early-exit optimization**: wrap the shared segment in an axis-aligned bounding box.
Skip the pair loop entirely if neither wagon's `worldPos` falls inside the AABB. The
AABB for the junction near `(963, 13, 22)` is roughly:

```
minX = 740,  maxX = 980
minY = -30,  maxY =  30
minZ =  18,  maxZ =  26
```

### 2.3 Block-Based Algorithm (Preferred for All Other Segments)

World-space proximity is expensive to reason about. For the majority of the route, a
block occupancy table gives the same safety guarantee with O(1) lookup:

```
SharedBlockCheck() — per tick (runs after occupancy is stamped for all wagons)
─────────────────────────────────────────────────────────────────────────────
for each LR wagon L:
  B_current  = nodeToBlock(TRACK_LR, L.curNode)
  B_next     = nextBlockAhead(TRACK_LR, L.curNode)   // first unoccupied block boundary

  // Check cross-track shared-block peer
  if BLOCK_TABLE[B_current].isShared:
    peerBlock = BLOCK_TABLE[B_current].sharedPeerBlock
    if isBlockOccupied(peerBlock, selfId=L.wagonId):
      L.targetSpeed = SPEED_HOLD   // peer (El) train is in the geometrically
                                   // equivalent block — LR must stop
      continue

  // Standard same-track look-ahead
  nodesAhead = distanceToNextOccupiedBlock(TRACK_LR, L.curNode)
  L.targetSpeed = speedForDistance(nodesAhead)
```

The `sharedPeerBlock` field in the `BlockDescriptor` struct (see §3.2) encodes the
cross-track mapping once, at compile time. No world-space math is needed at runtime.

---

## 3. Virtual Block Design for GTA III

### 3.1 Block Partitioning — Portland El (`tracks.dat`, 168 nodes)

Node indices are approximate pending Phase 2 verification of the exact junction node.

| Block name | Node range | Shared? | Notes |
| --- | --- | --- | --- |
| `EL_SHARED_JUNCTION` | 0–14 | ✅ peer: `LR_SHARED_JUNCTION` | Branch-off geometry near `(963, 13, 22)` |
| `EL_BAILLIE_APPROACH` | 15–32 | — | Northbound approach to Baillie station |
| `EL_BAILLIE_PLATFORM` | 33–42 | — | Baillie station dwell zone |
| `EL_EASTBAY_RUN` | 43–82 | — | Eastbound run; uncritical, no sharing |
| `EL_SUMMIT_CLIMB` | 83–105 | — | Elevated section over Saint Mark's (~Z 42) |
| `EL_KUROWSKI_APPROACH` | 106–125 | — | Southbound approach to Kurowski station |
| `EL_KUROWSKI_PLATFORM` | 126–136 | — | Kurowski station dwell zone (Chinatown) |
| `EL_SOUTH_LOOP` | 137–167 | — | Return loop back north |

### 3.2 Block Partitioning — Light Rail (`tracks3.dat`, ~208 nodes at 12 m/node)

| Block name | Node range | Shared? | Notes |
| --- | --- | --- | --- |
| `LR_SHARED_JUNCTION` | 0–10 | ✅ peer: `EL_SHARED_JUNCTION` | El geometry overlap — highest priority block |
| `LR_PORTLAND_VIEW_APP` | 11–27 | — | Approach to Portland View / Sweeney station |
| `LR_PORTLAND_VIEW_PLT` | 28–37 | — | Portland View station dwell |
| `LR_CALLAHAN_DESCENT` | 38–72 | — | Descent from Z 22 → Z 15 toward Callahan Bridge |
| `LR_CALLAHAN_JCT_APP` | 73–88 | — | Bridge deck approach |
| `LR_CALLAHAN_JCT_PLT` | 89–98 | — | Callahan Junction station dwell |
| `LR_STAUNTON_SURFACE` | 99–130 | — | Surface run across Staunton Island |
| `LR_NEWPORT_APP` | 131–142 | — | Approach to Newport station |
| `LR_NEWPORT_PLT` | 143–152 | — | Newport station dwell |
| `LR_SHORESIDE_BRIDGE` | 153–168 | — | Shoreside Lift Bridge crossing |
| `LR_SHORESIDE_RUN` | 169–188 | — | Pike Creek / Wichita Gardens surface |
| `LR_SHORESIDE_TERM_APP` | 189–198 | — | Approach to Shoreside Terminal |
| `LR_SHORESIDE_TERM_PLT` | 199–208 | — | Shoreside Terminal station dwell |
| `LR_FIA_APPROACH` | 209–218 | — | FIA access road descent |
| `LR_FIA_PLT` | 219–224 | — | FIA terminus station dwell (end of line) |

> ℹ️ **Note**: The route as currently specified in `generate-tracks.ts` is one-way
> (terminus to terminus, ~208 nodes). If the track is a full loop (return journey
> appended), add a symmetric block set for the return leg, numbered `LR_*_RET`.

### 3.3 D Data Structures

The ASI plugin is written in D (compiled to a Win32 DLL via LDC2). The block system
is entirely `@nogc nothrow` so it runs safely inside the game's render thread.

```gta3-light-rail/plugins/light-rail/block_signaling.d#L1-200
// block_signaling.d
// Compile with: ldc2 -shared -m32 -betterC block_signaling.d

module lightrail.block_signaling;

import core.stdc.string : memset;

// ─────────────────────────────────────────────────────────────────────────────
// Enumerations
// ─────────────────────────────────────────────────────────────────────────────

enum TrackId : ubyte {
    ElTrain   = 0,  // tracks.dat  — vanilla Portland El
    Subway    = 1,  // tracks2.dat — vanilla subway
    LightRail = 2,  // tracks3.dat — our ASI extension
}

/// Sentinel: node not covered by any declared block / slot unoccupied.
enum ubyte BLOCK_NONE = 0xFF;

// ─────────────────────────────────────────────────────────────────────────────
// Block descriptor
// ─────────────────────────────────────────────────────────────────────────────

/// A contiguous range of track-file nodes forming one signaling block.
/// All instances live in the read-only BLOCK_TABLE[] — never heap-allocated.
struct BlockDescriptor {
    ubyte   blockId;         /// Unique index into BLOCK_TABLE (0-based).
    TrackId trackId;         /// Which track file owns this block.
    ushort  firstNode;       /// Inclusive lower bound (track-file node index).
    ushort  lastNode;        /// Inclusive upper bound.
    bool    isShared;        /// True when geometry overlaps another track file.
    ubyte   sharedPeerBlock; /// blockId of the geometrically equivalent block
                             ///   on the peer track.  BLOCK_NONE when !isShared.
    immutable(char)[] name;  /// Human-readable label (logging / debug only).
}

// ─────────────────────────────────────────────────────────────────────────────
// Static block table  (compile-time definition — edit here as geometry is
// confirmed during Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

enum MAX_BLOCKS = 32;

/// Unused tail entries are zero-initialized; name.length == 0 is the sentinel.
immutable BlockDescriptor[MAX_BLOCKS] BLOCK_TABLE = () {
    BlockDescriptor[MAX_BLOCKS] t;
    size_t i;

    // ── Portland El (tracks.dat) ─────────────────────────────────────────────
    t[i++] = BlockDescriptor(0,  TrackId.ElTrain,    0,  14, true,  8,  "EL_SHARED_JUNCTION");
    t[i++] = BlockDescriptor(1,  TrackId.ElTrain,   15,  32, false, BLOCK_NONE, "EL_BAILLIE_APPROACH");
    t[i++] = BlockDescriptor(2,  TrackId.ElTrain,   33,  42, false, BLOCK_NONE, "EL_BAILLIE_PLATFORM");
    t[i++] = BlockDescriptor(3,  TrackId.ElTrain,   43,  82, false, BLOCK_NONE, "EL_EASTBAY_RUN");
    t[i++] = BlockDescriptor(4,  TrackId.ElTrain,   83, 105, false, BLOCK_NONE, "EL_SUMMIT_CLIMB");
    t[i++] = BlockDescriptor(5,  TrackId.ElTrain,  106, 125, false, BLOCK_NONE, "EL_KUROWSKI_APPROACH");
    t[i++] = BlockDescriptor(6,  TrackId.ElTrain,  126, 136, false, BLOCK_NONE, "EL_KUROWSKI_PLATFORM");
    t[i++] = BlockDescriptor(7,  TrackId.ElTrain,  137, 167, false, BLOCK_NONE, "EL_SOUTH_LOOP");

    // ── Light Rail (tracks3.dat) ─────────────────────────────────────────────
    // NOTE: sharedPeerBlock = 0 (EL_SHARED_JUNCTION).  isShared is set to
    // false until Phase 2 confirms the exact junction node overlap.
    t[i++] = BlockDescriptor(8,  TrackId.LightRail,   0,  10, false, BLOCK_NONE, "LR_SHARED_JUNCTION");
    t[i++] = BlockDescriptor(9,  TrackId.LightRail,  11,  27, false, BLOCK_NONE, "LR_PORTLAND_VIEW_APP");
    t[i++] = BlockDescriptor(10, TrackId.LightRail,  28,  37, false, BLOCK_NONE, "LR_PORTLAND_VIEW_PLT");
    t[i++] = BlockDescriptor(11, TrackId.LightRail,  38,  72, false, BLOCK_NONE, "LR_CALLAHAN_DESCENT");
    t[i++] = BlockDescriptor(12, TrackId.LightRail,  73,  88, false, BLOCK_NONE, "LR_CALLAHAN_JCT_APP");
    t[i++] = BlockDescriptor(13, TrackId.LightRail,  89,  98, false, BLOCK_NONE, "LR_CALLAHAN_JCT_PLT");
    t[i++] = BlockDescriptor(14, TrackId.LightRail,  99, 130, false, BLOCK_NONE, "LR_STAUNTON_SURFACE");
    t[i++] = BlockDescriptor(15, TrackId.LightRail, 131, 142, false, BLOCK_NONE, "LR_NEWPORT_APP");
    t[i++] = BlockDescriptor(16, TrackId.LightRail, 143, 152, false, BLOCK_NONE, "LR_NEWPORT_PLT");
    t[i++] = BlockDescriptor(17, TrackId.LightRail, 153, 168, false, BLOCK_NONE, "LR_SHORESIDE_BRIDGE");
    t[i++] = BlockDescriptor(18, TrackId.LightRail, 169, 188, false, BLOCK_NONE, "LR_SHORESIDE_RUN");
    t[i++] = BlockDescriptor(19, TrackId.LightRail, 189, 198, false, BLOCK_NONE, "LR_SHORESIDE_TERM_APP");
    t[i++] = BlockDescriptor(20, TrackId.LightRail, 199, 208, false, BLOCK_NONE, "LR_SHORESIDE_TERM_PLT");
    t[i++] = BlockDescriptor(21, TrackId.LightRail, 209, 218, false, BLOCK_NONE, "LR_FIA_APPROACH");
    t[i++] = BlockDescriptor(22, TrackId.LightRail, 219, 224, false, BLOCK_NONE, "LR_FIA_PLT");

    return t;
}();

// ─────────────────────────────────────────────────────────────────────────────
// Node → block lookup tables
// ─────────────────────────────────────────────────────────────────────────────

/// Supports up to 600 nodes per track (subway has 557; LR route ~224).
enum MAX_NODES_PER_TRACK = 600;

/// nodeBlockMap[trackId][nodeIndex] → blockId, or BLOCK_NONE.
/// Populated once by initBlockLookup(); read-only thereafter.
private ubyte[MAX_NODES_PER_TRACK][3] nodeBlockMap;

/// Call once during OnInitTrains to populate the LUT from BLOCK_TABLE.
void initBlockLookup() nothrow @nogc {
    memset(nodeBlockMap.ptr, BLOCK_NONE, nodeBlockMap.sizeof);

    foreach (ref bd; BLOCK_TABLE) {
        if (bd.name.length == 0) break;  // sentinel — rest of table is empty
        foreach (n; bd.firstNode .. cast(uint)(bd.lastNode) + 1) {
            if (n < MAX_NODES_PER_TRACK)
                nodeBlockMap[cast(ubyte)bd.trackId][n] = bd.blockId;
        }
    }
}

/// O(1) node → block lookup.  Returns BLOCK_NONE for uncovered nodes.
ubyte nodeToBlock(TrackId track, ushort nodeIndex) nothrow @nogc {
    if (nodeIndex >= MAX_NODES_PER_TRACK) return BLOCK_NONE;
    return nodeBlockMap[cast(ubyte)track][nodeIndex];
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime occupancy table
// ─────────────────────────────────────────────────────────────────────────────

/// blockOccupant[blockId] = wagonId of occupant, or 0xFF = unoccupied.
private ubyte[MAX_BLOCKS] blockOccupant;

/// Step 1 of per-tick update: clear all occupancy bits.
void clearOccupancy() nothrow @nogc {
    memset(blockOccupant.ptr, 0xFF, blockOccupant.sizeof);
}

/// Step 2: stamp a wagon's current block as occupied by that wagon.
void stampOccupancy(ubyte blockId, ubyte wagonId) nothrow @nogc {
    if (blockId != BLOCK_NONE && blockId < MAX_BLOCKS)
        blockOccupant[blockId] = wagonId;
}

/// Returns true if `blockId` is occupied by any wagon other than `selfId`.
bool isBlockOccupied(ubyte blockId, ubyte selfId) nothrow @nogc {
    if (blockId == BLOCK_NONE || blockId >= MAX_BLOCKS) return false;
    ubyte occ = blockOccupant[blockId];
    return occ != 0xFF && occ != selfId;
}

/// How many nodes ahead (on `track`, starting from `startNode`) until the
/// first block that is occupied by a train other than `selfId`?
/// Returns MAX_NODES_PER_TRACK when no occupied block is found in lookahead.
ushort nodesUntilOccupiedBlock(TrackId track, ushort startNode,
                               ubyte selfId, uint totalNodes) nothrow @nogc
{
    for (uint n = startNode + 1; n < startNode + MAX_BLOCKS * 20 && n < totalNodes; n++) {
        ubyte blk = nodeToBlock(track, cast(ushort)n);
        if (blk == BLOCK_NONE) continue;
        if (isBlockOccupied(blk, selfId)) return cast(ushort)(n - startNode);
    }
    return MAX_NODES_PER_TRACK;  // clear as far as we looked
}
```

### 3.4 Efficient Mapping: Why a Flat Array?

The flat `nodeBlockMap[3][600]` array occupies **3 × 600 = 1,800 bytes** — trivially
small. A lookup is two memory reads (array index arithmetic with no branching), making
it faster than any search-based alternative (binary search over BLOCK_TABLE, hash
map, etc.). Since `initBlockLookup()` runs once at startup the setup cost is
irrelevant.

---

## 4. Speed Control

### 4.1 Engine Constraints

Key constraints derived from `CTrain::ProcessControl()` (re3 source):

- Each tick: `m_fWagonPosition += m_fSpeed * dt` where `dt` is frame time (≈ 0.033 s
  at 30 FPS).
- When `m_fWagonPosition >= 1.0`: `m_nCurTrackNode++`, `m_fWagonPosition -= 1.0`.
- `m_fSpeed < 0` causes backward node traversal — undefined behavior (the engine
  only pre-computes forward arc positions). **Never write a negative speed.**
- A sudden jump of `|Δm_fSpeed|` > ~0.05/frame can cause `m_fWagonPosition` to
  overshoot multiple nodes in one tick, teleporting the train. This is visually
  jarring but does not crash the engine. It does, however, cause the block occupancy
  to skip intermediate blocks — potentially skipping a red signal.

**Safe speed delta limit: 0.03 units/frame** (empirical; derived from: at 30 FPS and
the 12 m node spacing, a delta of 0.03/frame means speed changes by 0.9 m/s per
second, well within passenger-comfort norms and below the skip threshold).

### 4.2 Approach Zones

Define four zones based on `nodesUntilOccupiedBlock` returned value:

| Zone | Nodes ahead | Target speed | Description |
| --- | --- | --- | --- |
| `CLEAR` | ≥ 13 | `0.40` | Line speed — full normal operation |
| `WARN` | 9–12 | `0.22` | Half-speed warning — occupied block visible ahead |
| `CAUTION` | 5–8 | `0.08` | Crawl — prepare to stop |
| `STOP_ZONE` | 1–4 | `0.02` | Creep — ready to halt in < 1 node |
| `HOLD` | 0 | `0.00` | Block entry denied; train is stationary |

The `STOP_ZONE → HOLD` transition takes at most 1 frame to complete because by the
time the wagon is in STOP_ZONE the delta from `0.02 → 0.00` is within
MAX_DELTA_PER_FRAME.

### 4.3 D Implementation

```gta3-light-rail/plugins/light-rail/speed_control.d#L1-60
// speed_control.d

module lightrail.speed_control;

// Speed constants (GTA III units/frame at 30 FPS ≈ meters/frame)
enum float SPEED_NORMAL = 0.40f;  // ~12 m/s — El train line speed
enum float SPEED_HALF   = 0.22f;  // ~6.6 m/s — WARN zone
enum float SPEED_CRAWL  = 0.08f;  // ~2.4 m/s — CAUTION zone
enum float SPEED_CREEP  = 0.02f;  // ~0.6 m/s — STOP_ZONE
enum float SPEED_HOLD   = 0.00f;  // stationary

/// Maximum speed change allowed per game frame.
/// Exceeding this threshold risks position-skip artifacts.
enum float MAX_DELTA_PER_FRAME = 0.03f;

/// Returns the target speed for a given look-ahead distance (in nodes).
float speedForDistance(ushort nodesAhead) @safe @nogc nothrow {
    if (nodesAhead == 0)    return SPEED_HOLD;
    if (nodesAhead <= 4)    return SPEED_CREEP;
    if (nodesAhead <= 8)    return SPEED_CRAWL;
    if (nodesAhead <= 12)   return SPEED_HALF;
    return SPEED_NORMAL;
}

/// Smoothly nudges `current` toward `target` by at most MAX_DELTA_PER_FRAME.
/// Write the return value directly to CTrain* + 0x294 (m_fSpeed).
float smoothSpeed(float current, float target) @safe @nogc nothrow {
    float delta = target - current;
    // Clamp delta to [-MAX_DELTA, +MAX_DELTA]
    if (delta >  MAX_DELTA_PER_FRAME) delta =  MAX_DELTA_PER_FRAME;
    if (delta < -MAX_DELTA_PER_FRAME) delta = -MAX_DELTA_PER_FRAME;
    float result = current + delta;
    // Hard floor at 0.0 — never allow negative speed
    return result < 0.0f ? 0.0f : result;
}
```

### 4.4 Braking Distance Verification

At SPEED_NORMAL = 0.40 and MAX_DELTA_PER_FRAME = 0.03, a full stop takes:

```
frames_to_stop = 0.40 / 0.03 ≈ 14 frames  (~0.46 s at 30 FPS)
```

During those 14 frames the wagon advances `0.40 + 0.37 + 0.34 + ... ≈ 2.9` node
widths — **under 3 nodes**. The WARN zone starts at 13 nodes out, giving >4× the
required stopping margin. The design is conservative.

### 4.5 El Train Priority

El wagons (`m_nTrackId == 0`) are managed by the vanilla engine and are **not** speed-
regulated by the ASI. Touching their `m_fSpeed` would desynchronize them from the
stock game's internal position tracking. The priority rule is enforced exclusively by
halting the LR wagons — El wagons are never slowed.

---

## 5. Headway Management

### 5.1 Physical Train Dimensions

A GTA III train wagon is approximately **14–16 game units (meters)** long based on
the DFF model bounding box. At 12 m/node spacing, one wagon footprint spans roughly
**1.3 nodes** on the array.

Minimum safe node separation to avoid visual overlap between the tail of the leading
wagon and the nose of the following wagon:

```
visual_gap = ceil(wagons_in_group × 1.3) + 1 buffer
           = ceil(1 × 1.3) + 1
           = 3 nodes  (absolute minimum, zero braking margin)
```

Adding the braking distance buffer from §4.4:

```
safe_headway_nodes = 3 (visual) + 3 (braking) + 2 (margin)
                   = 8 nodes minimum
```

**Recommended minimum headway: 8 nodes (96 m).**

### 5.2 Loop Geometry and Train Count

The route from `generate-tracks.ts` is a one-way open line (Portland View → FIA) with
~208 nodes at 12 m/node. Whether it is a full loop or a terminus-and-return depends
on Phase 2 geometry. These estimates assume a **closed loop** with a return leg of
equal length, giving:

| Parameter | Value |
| --- | --- |
| One-way node count | ~208 nodes |
| Full loop node count (round trip) | ~416 nodes |
| Full loop distance | ~4,992 m |
| Average speed | 0.40 units/frame × 30 FPS = 12 m/s |
| Station dwell time | ~5 s × 5 stations = 25 s (one direction) |
| One-way travel time | (208 nodes × 12 m) / 12 m/s + 25 s = 233 s |
| Full loop time | ~466 s ≈ **7.8 minutes** |

Headway for N trains on the loop:

| Trains | Headway | Node separation | Wait time at any station |
| --- | --- | --- | --- |
| 2 | 233 s | 208 nodes | ≤ 3.9 min |
| 3 | 155 s | 139 nodes | ≤ 2.6 min |
| **4** | **117 s** | **104 nodes** | **≤ 1.9 min** |
| 5 | 93 s | 83 nodes | ≤ 1.6 min |

**Recommendation: 4 light rail wagons.** This delivers a sub-2-minute headway, keeps
separation at 104 nodes (13× the 8-node minimum), and adds only 4 vehicles to the
pool (see §6).

If the line is one-way terminus-to-terminus (no return loop) rather than a closed
loop, fewer trains are needed because each train simply dwells at the terminus before
running back — reducing the loop time by eliminating dead-running. In that case 3
trains with timed reversals still provides acceptable headway.

### 5.3 Staggered Initial Placement

Set `m_nCurTrackNode` for each new wagon during the `OnInitTrains` hook:

| Wagon | Initial `m_nCurTrackNode` | Approx. world location |
| --- | --- | --- |
| LR-0 | 0 | Shared junction / Portland View approach |
| LR-1 | 104 | Callahan descent |
| LR-2 | 208 | Newport / Shoreside Bridge |
| LR-3 | 312 | Shoreside Terminal approach |

Each wagon is placed in a distinct block, so no block conflict occurs at startup.

---

## 6. Integration with the Game's Wagon Pool

### 6.1 `CTrain` Struct Layout (re3 / GTA III 1.0 US)

Relevant fields (offsets relative to `CTrain*`). Verify against your target executable
before hardcoding; the re3 reimplementation is the authoritative source.

| Offset | Type | Field | Notes |
| --- | --- | --- | --- |
| `+0x28C` | `uint16` | `m_nCurTrackNode` | Current node index |
| `+0x290` | `float` | `m_fSpeed` | Units/frame — directly writable |
| `+0x294` | `float` | `m_fWagonPosition` | Progress [0.0, 1.0] to next node |
| `+0x298` | `uint8` | `m_nTrackId` | 0 = El, 1 = Subway, **2 = LightRail** |
| `+0x299` | `uint8` | `m_nNumPassengers` | Read-only for our purposes |
| `+0x29C` | `CTrain*` | `m_pNextWagon` | Linked list — next wagon in group |
| `+0x2A0` | `uint8` | `m_nWagonGroupId` | Wagons with same ID form a train |

> ⚠️ **Offset uncertainty**: The re3 source uses struct members, not raw offsets. The
> specific byte offsets differ between the 1.0 US, 1.0 EU, and Steam (v1.1) builds due
> to alignment differences. Use the re3 `CTrain` struct definition and a symbolic
> offset calculation rather than hardcoded hex addresses where possible.

### 6.2 D Struct Overlay

```gta3-light-rail/plugins/light-rail/ctrain.d#L1-60
// ctrain.d — in-memory layout overlay for CTrain
// Offsets verified against re3 src/vehicles/Train.h for GTA III 1.0 US.

module lightrail.ctrain;

/// Partial overlay of the CTrain struct (vehicle base + train extension).
/// Cast a vehicle pool pointer to this for direct field access.
/// Only the fields we read/write are declared; unrelated fields are skipped
/// via padding bytes.
align(1) struct CTrainFields {
    ubyte[0x28C] _pad0;         // CVehicle base + earlier CTrain fields
    ushort  m_nCurTrackNode;    // +0x28C  current node index
    ubyte[2] _pad1;
    float   m_fSpeed;           // +0x290  units/frame (writable)
    float   m_fWagonPosition;   // +0x294  [0.0, 1.0)
    ubyte   m_nTrackId;         // +0x298  0=El 1=Subway 2=LightRail
    ubyte   m_nNumPassengers;   // +0x299
    ubyte[2] _pad2;
    CTrainFields* m_pNextWagon; // +0x29C  next wagon in group (or null)
    ubyte   m_nWagonGroupId;    // +0x2A0
}

static assert(CTrainFields.m_nCurTrackNode.offsetof == 0x28C);
static assert(CTrainFields.m_fSpeed.offsetof        == 0x290);
static assert(CTrainFields.m_fWagonPosition.offsetof == 0x294);
static assert(CTrainFields.m_nTrackId.offsetof       == 0x298);
static assert(CTrainFields.m_nWagonGroupId.offsetof  == 0x2A0);
```

If the static asserts fail during compilation, the offsets for this exe version differ
from the re3 reference. Correct them by diffing the re3 `CTrain` struct definition
against the disassembly of the target exe's `CTrain::ProcessControl`.

### 6.3 Wagon ID and Group ID Assignment

El and Subway group IDs are **independent namespaces** — the engine selects the track
namespace first via `m_nTrackId`, then disambiguates within it via `m_nWagonGroupId`.
El groups 0–1 and Subway groups 0–3 do not collide.

**Proposed light rail wagon assignments:**

| Wagon | `m_nTrackId` | `m_nWagonGroupId` | Role |
| --- | --- | --- | --- |
| LR-0 | 2 | 0 | Train A — car 1 (lead) |
| LR-1 | 2 | 0 | Train A — car 2 (trailing) |
| LR-2 | 2 | 1 | Train B — car 1 (lead) |
| LR-3 | 2 | 1 | Train B — car 2 (trailing) |

Each train group is two wagons linked via `m_pNextWagon`. The lead wagon's
`m_pNextWagon` points to the trailing wagon; the trailing wagon's `m_pNextWagon` is
null. Both wagons in a group share the same `m_nWagonGroupId` and `m_nTrackId`.

If single-wagon operation is simpler to implement initially (no linked-list management):

| Wagon | `m_nTrackId` | `m_nWagonGroupId` |
| --- | --- | --- |
| LR-0 | 2 | 0 |
| LR-1 | 2 | 1 |
| LR-2 | 2 | 2 |
| LR-3 | 2 | 3 |

### 6.4 Vehicle Pool Budget

`CPools::ms_pVehiclePool` cap: **110 entries** (hard limit in 1.0 US exe).

| Category | Count |
| --- | --- |
| Permanent El wagons (vanilla) | 5 |
| Permanent Subway wagons (vanilla) | 8 |
| New LR wagons (ASI-allocated) | 4 |
| Other permanent vehicles (coaches, etc.) | ~3 |
| **Total permanent** | **~20** |
| **Remaining for dynamic traffic** | **~90** |

GTA III's traffic system typically spawns 30–50 vehicles in a live session. A headroom
of 90 is very comfortable — the LR wagons leave the same budget as the vanilla game
does.

**Failure mode**: `CTrain::InitTrains()` (or our hook equivalent) calls
`CPools::ms_pVehiclePool->New()` to allocate each wagon. If the pool is full, `New()`
returns `nullptr` and the wagon is silently skipped. Because our ASI hook runs during
the init phase (before any traffic spawns), pool exhaustion at startup is not a
practical concern.

**After loading**, always validate pointers:

```gta3-light-rail/plugins/light-rail/wagon_pool.d#L1-30
// wagon_pool.d

module lightrail.wagon_pool;

import lightrail.ctrain : CTrainFields;

enum MAX_LR_WAGONS = 4;

private CTrainFields*[MAX_LR_WAGONS] lrWagons;
private uint lrWagonCount;

/// Called from the OnInitTrains hook after all CTrain allocations.
/// Stores non-null wagon pointers; ignores null (pool-full) slots.
void registerWagon(uint idx, CTrainFields* p) nothrow @nogc {
    if (idx >= MAX_LR_WAGONS) return;
    lrWagons[idx] = p;  // null is a valid (failed-allocation) state
    if (p !is null) lrWagonCount++;
}

/// Returns false if this wagon was never allocated (pool was full at init).
/// Callers must check before dereferencing.
bool isWagonValid(uint idx) nothrow @nogc {
    return idx < MAX_LR_WAGONS && lrWagons[idx] !is null;
}

CTrainFields* getWagon(uint idx) nothrow @nogc {
    return isWagonValid(idx) ? lrWagons[idx] : null;
}
```

### 6.5 ASI Hook Sequence (Summary)

```
OnInitTrains  (MinHook on CTrain::InitTrains, called after original returns)
  1.  Call initBlockLookup() → populate nodeBlockMap LUT.
  2.  Allocate 4 CTrain entries from the vehicle pool.
  3.  Set m_nTrackId = 2 on each.
  4.  Set m_nWagonGroupId = 0 / 0 / 1 / 1.
  5.  Link m_pNextWagon for each group (LR-0 → LR-1, LR-2 → LR-3).
  6.  Set staggered m_nCurTrackNode (0, 104, 208, 312).
  7.  Set m_fSpeed = SPEED_NORMAL on all four.
  8.  Store pointers via registerWagon().

OnProcessControl  (MinHook on CTrain::ProcessControl, called each frame per wagon)
  — Run the original first; let the engine advance position normally.
  — Then run our block signaling logic for LR wagons only:
      1.  clearOccupancy()
      2.  for each all wagon (El + LR): read m_nCurTrackNode, stampOccupancy()
      3.  for each LR wagon:
            a.  Check shared peer block (El junction cross-track)
            b.  nodesAhead = nodesUntilOccupiedBlock(...)
            c.  target = speedForDistance(nodesAhead)
            d.  wagon.m_fSpeed = smoothSpeed(wagon.m_fSpeed, target)
          — El wagons: no speed modification; read-only for occupancy stamping only.
```

---

## Summary of Concrete Design Decisions

| Topic | Decision |
| --- | --- |
| **Signaling model** | Absolute block, 3-aspect look-ahead (CLEAR/WARN/CAUTION/STOP/HOLD) |
| **Block granularity** | 8–25 nodes/block (96–300 m) at 12 m/node spacing |
| **Shared segment detection** | Block table with `isShared` / `sharedPeerBlock` fields + world-space proximity fallback for the junction AABB |
| **El train priority** | Unconditional — LR wagons always yield, El wagons are never speed-modified |
| **Speed regulation** | Smooth ramp via `smoothSpeed()`, MAX_DELTA = 0.03/frame; hard floor at 0.0; never negative |
| **Minimum safe headway** | 8 nodes (96 m); running headway with 4 wagons ≈ 104 nodes (1,248 m) |
| **Wagon count** | **4 light rail wagons** — delivers ~2-minute headway on the ~7.8-minute loop |
| **Wagon group IDs** | `m_nTrackId = 2`, `m_nWagonGroupId = 0–1` (two 2-car trains) or `0–3` (four singles) |
| **Pool safety** | 4 new wagons → ~20 permanent total, leaving ~90 slots for traffic — safe margin |
| **Pointer validation** | `isWagonValid()` check before every memory access post-init |
