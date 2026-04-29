# ASI Plugin — D Language Complexity Analysis

**Question**: How hard is it to add a genuine third track (`tracks3.dat`) using a native ASI
plugin written in **D**, and what does the plugin need to do beyond just loading the file?

This document covers:
1. [D as a DLL / ASI target](#1-d-as-a-dll--asi-target)
2. [What "ASI plugin" actually means — no SDK required](#2-what-asi-plugin-actually-means)
3. [Hooks required and their complexity](#3-hooks-required)
4. [New wagon spawning strategy](#4-new-wagon-spawning)
5. [Block signaling — collision avoidance on shared track](#5-block-signaling)
6. [Integration with the CLEO Redux TypeScript plugin](#6-integration-with-cleo-redux)
7. [Complexity estimate and risks](#7-complexity-estimate-and-risks)

---

## 1. D as a DLL / ASI Target

### Compiler choice

| Compiler | Win32 DLL | Recommended? | Notes |
|---|---|---|---|
| **LDC** (LLVM back-end) | ✅ `-m32 -shared` | **Yes** | Best Win32 support; uses MSVC `link.exe` or `lld-link`; `-betterC` stable |
| **DMD** (reference) | ✅ `-m32 -shared` | Acceptable | Default linker is OPTLINK (old, 32-bit only); switch to MSVC link with `-mscoff` |
| **GDC** (GCC back-end) | Possible | No | Rarely used on Windows; MinGW complications |

**Recommended toolchain**: LDC 1.x + MSVC Build Tools (link.exe) + Windows SDK.  
Build command for the final plugin DLL:

```
ldc2 -m32 -betterC -shared -fvisibility=hidden \
     -L/SUBSYSTEM:WINDOWS -L/NODEFAULTLIB:libcmt \
     -of=light-rail.asi \
     src\plugin.d src\hooks.d src\train.d src\signal.d \
     lib\MinHook.x86.lib
```

The `.asi` extension is just a renamed `.dll` — no special tooling needed.

### BetterC mode (`-betterC`)

`-betterC` eliminates the D runtime entirely: no GC, no `TypeInfo`, no module constructors,
no exceptions, no `assert` (unless you add your own). This is exactly what a game plugin
needs — there is no D runtime initialisation to fight with the host process.

What **remains** available in BetterC:

- `extern(C)` and `extern(Windows)` function declarations and definitions
- `struct` and `union` (no class virtual dispatch without manual vtable)
- `static` arrays, pointer arithmetic, `cast`
- `core.stdc.*` (malloc, free, memcpy, sprintf…)
- `core.sys.windows.*` (HANDLE, HMODULE, LoadLibrary…)
- Inline assembly (`asm { … }` blocks — LDC uses AT&T syntax or GAS syntax)
- `pragma(inline, true)`, `@nogc`, `nothrow`
- Templates and `static if` (evaluated at compile time, zero runtime overhead)

What you **lose**:

- `new` / `delete` (replace with `malloc` / `free`)
- D arrays with GC backing (use static arrays or manual pointer+length pairs)
- Associative arrays (use a hand-rolled hash map or a static lookup table)
- `scope` / destructors involving GC (RAII still works with manual `scope(exit)`)

For a train-extension plugin that manages ≤20 wagons, static arrays are perfectly adequate.
No dynamic allocation is needed at runtime after init.

### Calling conventions

GTA III (Win32) uses two calling conventions:

| Convention | Who uses it | D attribute |
|---|---|---|
| `__cdecl` | C functions, `static` class methods | `extern(C)` |
| `__thiscall` | C++ non-static member functions | see below |

**`__thiscall` in D** — D has no `extern(ThiscallC++)` attribute. Two practical strategies:

**Option A — Naked trampoline** (recommended for hooks): Write a tiny `@naked` function in
inline assembly that moves ECX (the `this` pointer) onto the stack as the first argument and
jumps to your D handler. LDC supports `@naked` via `pragma(LDC_never_inline)` +
`asm { naked; }`.

```d
// hooks.d
alias ProcessCtrlFn = extern(C) void function(CTrain* self) nothrow @nogc;
__gshared ProcessCtrlFn originalProcessControl;

// Thiscall trampoline — ECX = this on entry
pragma(LDC_never_inline)
extern(C) void processControlThunk() nothrow @nogc {
    asm {
        naked;
        sub  ESP, 4;          // make room for arg
        mov  [ESP], ECX;      // push `this` as first stack arg
        call processControlHook; // call our __cdecl hook
        add  ESP, 4;
        ret;
    }
}

extern(C) void processControlHook(CTrain* self) nothrow @nogc {
    if (self.m_nTrackId == TrackId.THIRD) {
        lightRailProcessControl(self);
    } else {
        originalProcessControl(self);  // call original for El + Subway
    }
}
```

**Option B — `extern(C++)` dummy method**: For simple read/call cases (no hooking), declare the
member function as `extern(C++) void processControl()` inside a `struct CTrain`. LDC will
emit the correct thiscall ABI on Win32 MSVC targets. This only works cleanly when *calling*
the function, not when *replacing* it.

---

## 2. What "ASI Plugin" Actually Means

There is **no special ASI SDK or library to link against**. An ASI plugin is a Windows DLL
renamed `.asi`. Ultimate ASI Loader (shipped with CLEO Redux as `vorbisFile.dll`,
`dinput8.dll`, or similar) calls `LoadLibrary("light-rail.asi")` on startup, which invokes
your `DllMain` with `DLL_PROCESS_ATTACH`.

The entire plugin API surface is:

```d
// plugin.d — complete entry point
import core.sys.windows.windows;
import hooks : installHooks;

extern(Windows) BOOL DllMain(HINSTANCE hInstance, DWORD reason, LPVOID) nothrow @nogc {
    if (reason == DLL_PROCESS_ATTACH) {
        DisableThreadLibraryCalls(hInstance);
        installHooks();  // set up MinHook patches
    } else if (reason == DLL_PROCESS_DETACH) {
        uninstallHooks();
    }
    return TRUE;
}
```

That's it. No headers to include from a game SDK. The plugin interacts with the game purely
through **MinHook trampolines** and **direct memory reads/writes** against known GTA III 1.0
addresses.

MinHook is a small, MIT-licensed C library (one `.h` + one `.lib`) that handles the
32-bit trampoline generation internally. D bindings:

```d
// minhook.d
extern(C) @nogc nothrow:

enum MH_STATUS : int { MH_OK = 0, MH_ERROR_ALREADY_INITIALIZED = 1, /* … */ }
MH_STATUS MH_Initialize();
MH_STATUS MH_CreateHook(void* pTarget, void* pDetour, void** ppOriginal);
MH_STATUS MH_EnableHook(void* pTarget);
MH_STATUS MH_ApplyQueued();
MH_STATUS MH_Uninitialize();
enum void* MH_ALL_HOOKS = null;
```

---

## 3. Hooks Required

The minimum set of hooks to support `tracks3.dat` + new wagons is three functions.
All addresses are for **GTA III 1.0 USA** (base `0x400000`); they must be confirmed against
the binary with Ghidra or the community address list before shipping.

### 3.1 `CTrain::InitTrains()` — `static __cdecl`, addr ≈ `0x4A18A0`

**Purpose**: runs once at game init; loads the two dat files; spawns 13 wagons.

**Hook strategy**: detour with a post-hook pattern.

```d
// After calling the original InitTrains, run our extension.
alias InitTrainsFn = extern(C) void function() nothrow @nogc;
__gshared InitTrainsFn origInitTrains;

extern(C) void initTrainsHook() nothrow @nogc {
    origInitTrains();           // load tracks.dat, tracks2.dat, spawn 13 wagons
    lightRail_InitTrains();     // load tracks3.dat, spawn N new wagons, fill our globals
}
```

**`lightRail_InitTrains()` must**:
1. Call `ReadAndInterpretTrackFile` (≈ `0x4A0480`) with paths and our own static output
   buffers (`pTrackNodes_T`, `NumTrackNodes_T`, `StationDist_T[5]`, etc.).
2. Spawn N wagons with `m_nTrackId = 2` using `new CTrain(MI_TRAIN, PERMANENT_VEHICLE)`
   via the game's allocator.
3. Set `m_nWagonGroup`, `m_nWagonId`, `m_fWagonPosition`, `m_bIsFirstWagon`,
   `m_bIsLastWagon` for each wagon.
4. Call `CWorld::Add(train)` for each wagon.

Calling game functions from D:

```d
// Declare the raw function pointer for ReadAndInterpretTrackFile
alias ReadTrackFn = extern(C) void function(
    const(char)* filename,
    CTrainNode** outNodes,
    short* outCount,
    int numStations,
    float* stationDists,
    float* totalLength,
    float* totalDuration,
    CTrainInterpolationLine* interpLines,
    bool rightRail,
) nothrow @nogc;

enum void* ADDR_ReadTrackFile = cast(void*) 0x4A0480;
```

### 3.2 `CTrain::ProcessControl()` — `__thiscall`, addr ≈ `0x4A04E0`

**Purpose**: called every tick on each wagon; reads the engine position globals and moves
the wagon to the correct world position.

**Hook strategy**: thiscall trampoline (see §1). Intercept the function; if `m_nTrackId == 2`,
call our own position-update logic instead; otherwise call original.

The re3 source shows `ProcessControl` is entirely self-contained (no virtual dispatch
within). Our replacement for `TRACK_THIRD` can be a faithful D reimplementation of the same
position-interpolation logic but reading from our own `EngineTrackPosition_T[]` globals:

```d
// Key fields of CTrain accessed by the hook — replicate the struct layout:
struct CTrain {  // only the fields we touch
    align(1):
    ubyte[0x288] _base;          // CVehicle body — do not touch
    float  m_fWagonPosition;     // +0x288
    short  m_nWagonId;           // +0x28C
    short  m_isFarAway;          // +0x28E
    short  m_nCurTrackNode;      // +0x290
    short  m_nWagonGroup;        // +0x292
    float  m_fSpeed;             // +0x294
    bool   m_bProcessDoor;       // +0x298
    bool   m_bTrainStopping;     // +0x299
    bool   m_bIsFirstWagon;      // +0x29A
    bool   m_bIsLastWagon;       // +0x29B
    ubyte  m_nTrackId;           // +0x29C  ← our key field
    // … rest of struct omitted
}
static assert(CTrain.m_nTrackId.offsetof == 0x29C);
```

### 3.3 `CTrain::UpdateTrains()` — `static __cdecl`, addr ≈ `0x4A1E50`

**Purpose**: per-frame; advances `EngineTrackPosition[]` and `EngineTrackSpeed[]` for both
existing tracks by evaluating the piecewise motion schedule from `aLineBits[]`.

**Hook strategy**: post-hook that appends a third update loop.

```d
alias UpdateTrainsFn = extern(C) void function() nothrow @nogc;
__gshared UpdateTrainsFn origUpdateTrains;

extern(C) void updateTrainsHook() nothrow @nogc {
    origUpdateTrains();              // update El + Subway engine globals
    lightRail_UpdateTrains();        // update our EngineTrackPosition_T[] globals
    lightRail_RunSignalLogic();      // block signaling — speed overrides (see §5)
}
```

### Address confirmation

Before shipping, confirm the three addresses by searching for known byte sequences with
Ghidra or by scanning for their associated string literals in the `.rodata` section:

| Function | Confirmation marker |
|---|---|
| `ReadAndInterpretTrackFile` | xref to string literal `"data\\paths\\tracks.dat"` |
| `InitTrains` | xref to `ReadAndInterpretTrackFile`, two consecutive calls |
| `ProcessControl` | search for `if(m_nTrackId == 1)` machine pattern (CMP byte ptr [ECX+0x29C], 1) |
| `UpdateTrains` | search for `TotalDurationOfTrack` float constant usage |

---

## 4. New Wagon Spawning

### How many wagons?

The new line has 5 stations (Portland View → Callahan Junction → Newport → Shoreside Terminal
→ FIA). Using the same motion constants as the vanilla system (speed 15.0 units/s, 25 s
dwell, ~80/15 s accel/decel ramps), a rough estimate:

| Segment | World distance (units) | Travel time |
|---|---|---|
| Portland View → Callahan Jct | ~400 | ~27 s |
| Callahan Jct → Newport | ~450 | ~30 s |
| Newport → Shoreside Terminal | ~700 | ~47 s |
| Shoreside Terminal → FIA | ~730 | ~49 s |
| FIA → Portland View (return) | ~2280 | ~152 s |

Total loop ≈ **305 s + (5 × 25 s dwell) = ~430 s ≈ 7 minutes** per circuit.

For a target headway of ≈3.5 minutes (trains pass any given point every 3–4 min), **2
engine groups** are needed. Each group carries 2 wagons (matching the 2-car Subway unit).

**New wagon count: 4** (2 groups × 2 wagons each, wagon IDs 13–16).

With 13 existing wagons + 4 new = **17 total**, well within CPools' 110-vehicle limit.

### Wagon initialisation table

| m_nWagonId | m_nWagonGroup | m_fWagonPosition | m_bIsFirstWagon | m_bIsLastWagon | m_nTrackId |
|---|---|---|---|---|---|
| 13 | 0 | 0.0 | true | false | 2 |
| 14 | 0 | 20.0 | false | true | 2 |
| 15 | 1 | 0.0 | true | false | 2 |
| 16 | 1 | 20.0 | false | true | 2 |

Groups 0 and 1 are staggered to half the loop period (~215 s) so they pass any station ≈3.5
minutes apart — matching the vanilla subway's headway feel.

### `aLineBits_T` schedule (5 stations)

The piecewise motion table has `4 × numStations + 2 = 22` entries. This is a
compile-time static array in D:

```d
// train.d
__gshared CTrainInterpolationLine[22] aLineBits_T;
__gshared float[5] StationDist_T = [
    450.0f,    // Portland View
    900.0f,    // Callahan Junction
    1450.0f,   // Newport
    2200.0f,   // Shoreside Terminal
    2930.0f,   // FIA (loop end)
];
// Populated by ReadAndInterpretTrackFile using StationDist_T as input
```

---

## 5. Block Signaling

### The problem

The new light rail line physically shares track with the Portland El near the branch-off
point (`~(963, 13, 22)`, northernmost El node). GTA III has no inter-train awareness:
a tracks3.dat wagon and a tracks.dat El wagon could occupy the same physical location.

Because the two track files have **independent node-index spaces**, we cannot compare
`m_nCurTrackNode` directly. We must work in **world-space position**.

### Block definition

A **block** is a named world-space interval along a track. Trains claim a block before
entering it and release it after leaving.

```d
// signal.d
struct Block {
    float[3] enter;   // world XYZ of block entry point (start of shared segment)
    float[3] exit;    // world XYZ of block exit point
    int      occupant; // wagon ID holding this block (-1 = free)
}

enum MAX_BLOCKS = 8;
__gshared Block[MAX_BLOCKS] gBlocks;
```

For the Portland El / light rail merge point, we define one shared block covering the
~200-node stretch of El track between the branch-off and the nearest safe divergence point
(approximate world range: X ∈ [760, 963], Y ∈ [-50, 14]):

```d
// Initialised in DllMain after gBlocks is zeroed
gBlocks[0] = Block(
    enter: [760.0f, -50.0f, 22.0f],
    exit:  [963.0f,  14.0f, 22.0f],
    occupant: -1,
);
```

### Per-tick occupancy check

Implemented inside `lightRail_RunSignalLogic()`, called from the `UpdateTrains` hook:

```d
void lightRail_RunSignalLogic() nothrow @nogc {
    // Step 1: release blocks held by wagons that have moved past their exit
    for (int b = 0; b < MAX_BLOCKS; b++) {
        if (gBlocks[b].occupant < 0) continue;
        CTrain* holder = findWagonById(gBlocks[b].occupant);
        if (holder is null || wagonPastBlock(holder, gBlocks[b])) {
            gBlocks[b].occupant = -1;
        }
    }

    // Step 2: for each approaching wagon, check if its next block is free
    iterateAllTrainWagons((CTrain* w) {
        if (!w.m_bIsFirstWagon) return;  // only engines drive speed decisions
        int nextBlock = blockAheadOf(w);
        if (nextBlock < 0) return;       // no shared block ahead

        if (gBlocks[nextBlock].occupant < 0) {
            // Block is free — claim it and run at normal speed
            gBlocks[nextBlock].occupant = w.m_nWagonId;
        } else if (gBlocks[nextBlock].occupant != w.m_nWagonId) {
            // Block is taken — apply braking
            applySignalBrake(w, nextBlock);
        }
    });
}
```

### Braking model

`applySignalBrake` modulates `EngineTrackSpeed_T[group]` rather than `m_fSpeed` directly
(which is a cached read-back value). Speed must never go negative (trains don't reverse):

```d
void applySignalBrake(CTrain* w, int blockIdx) nothrow @nogc {
    float dist   = distToBlockEntry(w, gBlocks[blockIdx]);
    float brakeG = 0.3f;  // deceleration in track-units/s^2 — softer than vanilla 45/32
    float safeSpd = sqrt(2.0f * brakeG * dist);  // v² = 2as → v = √(2as)
    int   grp     = w.m_nWagonGroup;
    if (EngineTrackSpeed_T[grp] > safeSpd) {
        EngineTrackSpeed_T[grp] = safeSpd;
    }
}
```

A braking constant of `0.3 u/s²` produces a comfortable stop from 15 u/s in about 50
units of track — roughly 5 node spacings, well within visual range.

### `iterateAllTrainWagons`

Since there is no global handle array (wagons live only in the vehicle pool), we scan the
pool:

```d
// CPools::ms_pVehiclePool at GTA3 1.0 USA 0x683A20
enum uint ADDR_VehiclePool = 0x683A20;
enum int  VEHICLE_POOL_SIZE = 110;
enum uint VEHICLE_TYPE_TRAIN = 8;  // eVehicleType::VEHICLE_TRAIN from re3

void iterateAllTrainWagons(scope void delegate(CTrain*) nothrow @nogc cb) nothrow @nogc {
    // The pool is a CPool<CVehicle,CAutomobile> — each slot is 0x7C4 bytes.
    // Slot 0 of the pool struct is the array base pointer.
    void** poolPtr = cast(void**) ADDR_VehiclePool;
    if (*poolPtr is null) return;
    for (int i = 0; i < VEHICLE_POOL_SIZE; i++) {
        // bit-field at (flags array base + i/8) checks if slot is used
        // simplified: read the "used" flag from pool internals
        CVehicle* veh = getVehicleSlot(*poolPtr, i);
        if (veh is null) continue;
        if (veh.m_vehType != VEHICLE_TYPE_TRAIN) continue;
        cb(cast(CTrain*) veh);
    }
}
```

### Headway between same-track wagons

Even without shared blocks with the El, two light rail groups on tracks3.dat could catch
each other on the loop. A simpler headway guard:

```d
// In UpdateTrains hook, after advancing EngineTrackPosition_T[]:
// Ensure group 1 is always ≥ MIN_HEADWAY track-units behind group 0.
enum float MIN_HEADWAY = 200.0f;  // ~10 node spacings = safe visual separation

float gap = EngineTrackPosition_T[0] - EngineTrackPosition_T[1];
// (wrap-around on the loop)
if (gap < 0) gap += TotalLengthOfTrack_T;
if (gap < MIN_HEADWAY) {
    // Slow group 1 until gap reopens
    EngineTrackSpeed_T[1] = fmax(0.0f, EngineTrackSpeed_T[1] - 0.1f);
} else if (EngineTrackSpeed_T[1] < NOMINAL_SPEED) {
    EngineTrackSpeed_T[1] = fmin(NOMINAL_SPEED, EngineTrackSpeed_T[1] + 0.05f);
}
```

---

## 6. Integration with CLEO Redux TypeScript Plugin

The D ASI plugin handles **engine-level concerns** (loading, spawning, physics, signaling).
The CLEO Redux TypeScript plugin handles **gameplay-level concerns** (HUD, station UI, player
boarding logic). The two layers communicate through shared memory — specifically, through the
`CTrain` struct fields that both can read:

| Field | D plugin writes | TS plugin reads | Use |
|---|---|---|---|
| `m_nCurTrackNode` | ✅ (by ProcessControl) | ✅ via `READ_MEMORY` | Station detection |
| `m_fSpeed` | ✅ (by signal logic) | ✅ | Speed indicator |
| `m_nTrackId` | ✅ (= 2 for new wagons) | ✅ | Identify light rail wagons |
| `m_bTrainStopping` | ✅ | ✅ | Door-open trigger |

The TS plugin never needs to know about block signaling internals. It just watches
`m_nCurTrackNode` to know which station a wagon is at, same as it would for the vanilla
trains.

Load order is guaranteed: the ASI runs at `DLL_PROCESS_ATTACH` (before game `main`); the
CLEO Redux script starts when a save is loaded. By that point all wagons are already in the
vehicle pool.

---

## 7. Complexity Estimate and Risks

### Work breakdown

| Task | Estimated effort | Notes |
|---|---|---|
| D + LDC + MinHook DLL skeleton | 0.5 day | Boilerplate; MinHook binding is ~30 lines |
| `CTrain` struct binding in D | 0.5 day | Layout must be verified against binary |
| Address confirmation (Ghidra) | 1 day | One-time; must redo for each EXE variant |
| `InitTrains` hook + `ReadAndInterpretTrackFile` call | 1 day | Mostly mechanical |
| Wagon spawning (`new CTrain` + `CWorld::Add`) | 1.5 days | Needs pool allocator binding + vtable setup |
| `ProcessControl` thiscall hook + position math | 2 days | Position interpolation is the hardest part |
| `UpdateTrains` hook + piecewise motion schedule | 1.5 days | Schedule constants must match dat file |
| Block signaling system | 1.5 days | Design is clear; implementation is straightforward |
| Testing + address fixes | 2 days | Expect one round of crash debugging |
| **Total** | **~11 days** | Solo developer, GTA III modding experience assumed |

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Address mismatch** — plugin compiled against wrong EXE version crashes instantly | High | Signature-scan for addresses at runtime instead of hardcoding; fail gracefully if scan fails |
| **`new CTrain` constructor** ABI — the C++ ctor uses thiscall; must call the correct allocator | High | Use `operator new(sizeof(CTrain))` + manual vtable pointer set, same pattern as plugin-sdk |
| **Vehicle pool overflow** — if player has 93+ vehicles loaded, +4 train slots = crash | Low | Trains use `PERMANENT_VEHICLE` flag and are never GC'd; in practice pool never hits 110 |
| **Thiscall trampoline on LDC** — `@naked` + inline asm behaviour may differ between LDC versions | Medium | Test with LDC 1.35; fix to a known-good version in build scripts |
| **Steam / Rockstar Launcher EXE variants** — addresses differ | High | Ship separate address tables per EXE variant; autodetect by CRC32 of the EXE header |
| **re3 / reVC** — users running the open-source port have completely different addresses | Medium | Guard with `HOST` check from CLEO Redux or skip hooking if signature scan fails |

### D vs C++ comparison

| Dimension | D (BetterC + LDC) | C++ (MSVC / plugin-sdk) |
|---|---|---|
| Language expressiveness | Higher (templates, CTFE, mixins) | Standard |
| Ecosystem / example code | Minimal GTA modding precedent | Extensive (plugin-sdk, GTASA mods) |
| Thiscall hooks | Requires manual asm trampoline | MinHook + `__thiscall` declaration |
| Memory safety | Opt-in (`@safe`) | None |
| Build system | `dub` or manual `ldc2` invocation | CMake + MSVC |
| Binary size | Comparable (~50 KB for this plugin) | Similar |
| Debugging | No natvis; use x32dbg | x32dbg + MSVC debugger |

D is a perfectly viable choice. The main cost over C++ is the **lack of GTA III modding
examples in D** — every binding and calling-convention decision must be verified from first
principles. With the re3 source and this document as a reference, that cost is manageable.
