# Asset Loading Research — Phase 2.2

Answers the four open questions from the plan checklist:

> - Load new track rights of way, i.e. models and textures
> - Spawn new train models
> - Load `tracks3.dat`, somehow?
> - Start the new light rail trains on the new tracks path

**Verdict up front**: The CLEO Redux TypeScript plugin alone **cannot do all of this**. Every item requires either a
companion C++ ASI plugin or a permanent installation step (file editing). The most practical path forward — and the one
that avoids a companion ASI entirely — is **extending `tracks2.dat`** rather than introducing a third track file. See §5
for the decision tree.

---

## 1. Loading Models and Textures (DFF/TXD)

### How GTA III streaming works

GTA III loads all vehicle DFF and TXD assets from `models/gta3.img` and `models/txd.img` through its CDstream system.
Every asset must:

1. Be present in a registered IMG archive (on disk, before the game starts).
2. Have an IDE entry in `data/default.ide` (or a supplementary `.ide` declared in `data/gta3.dat`).
3. Have a handling entry in `data/handling.cfg`.

Secondary IMG archives can be added via a `CDIMAGE` line in `data/gta3.dat`:

```
CDIMAGE models\lightrail.img
```

This keeps mod assets separate from vanilla files (cleaner uninstall). The hard limit is **8 simultaneously open IMG
archives** without fastman92's IMG Limit Adjuster ASI.

### What CLEO Redux can do at runtime

CLEO Redux exposes the native streaming opcodes:

| Opcode | Name                    | Notes                                                   |
| ------ | ----------------------- | ------------------------------------------------------- |
| `0247` | `REQUEST_MODEL`         | Queue a model (integer IDE ID or `#NAME`) for streaming |
| `0248` | `IS_MODEL_AVAILABLE`    | Conditional check                                       |
| `038B` | `LOAD_REQUESTED_MODELS` | Synchronous wait until fully loaded                     |
| `0249` | `RELEASE_MODEL`         | Free the model slot                                     |

These work perfectly for models pre-registered in IDE/IMG. A CLEO Redux TypeScript script can call them to ensure a
custom train model is in GPU memory before spawning a vehicle.

### What CLEO Redux **cannot** do at runtime

**There is no opcode to stream a DFF/TXD from an arbitrary file path at runtime.** No `STREAM_CUSTOM_MODEL`, no
path-based loader. The only way to do true runtime loading would be calling the game's internal `CStreaming` functions
via `CALL_FUNCTION` (opcode `0AA5`), which is fragile and essentially a compiled ASI written in script.

### Conclusion

New train models require a **permanent installation step** (add to IMG, edit IDE/handling). Tools: IMGTool / fastman92
IMG Console, CollEditorII. The CLEO Redux TypeScript plugin handles the runtime `REQUEST_MODEL` + `RELEASE_MODEL`
lifecycle, but it cannot bootstrap the asset into the streaming system itself.

**Mod Loader** (`thelink2012/modloader`) is the cleanest end-user installation path — it intercepts game file I/O at
startup and injects assets from a `modloader/` directory without touching original game files.

---

## 2. Spawning New Train Models

### Only one train model exists in vanilla GTA III

Both the Portland El and the Shoreside Subway share a single model named `"train"` (integer ID typically **197**,
resolved at runtime from the IDE). There are no separate "El car" and "subway car" assets in the base game.

### Vehicle model ID landscape

| ID range | Notes                                                                                  |
| -------- | -------------------------------------------------------------------------------------- |
| 90–150   | All vanilla vehicle slots — fully occupied                                             |
| 151–159  | Technically usable but some IDs (154, 155, 159) are hazardous without fix plugins      |
| 160+     | Requires **Vehicle Audio Loader** ASI for sound (without it the game crashes on spawn) |
| 4000+    | Requires **fastman92 Limit Adjuster** to extend the streaming slot table               |

The lowest-risk approach for a new "light rail" model is to **replace model ID 197** (`"train"`) with a custom model.
Both the El and Subway would then display the new visual. If genuinely distinct visuals per-line are needed, a second
model at ID 151+ with `Vehicle Audio Loader` is required.

### CLEO script-level train spawn opcodes

There are **zero** SCM opcodes in GTA III for creating or directly controlling train vehicles. The closest is:

| Opcode | Name                       | Description                                 |
| ------ | -------------------------- | ------------------------------------------- |
| `032E` | `SET_CHAR_OBJ_CATCH_TRAIN` | Make a ped walk to and board a nearby train |

All 13 train wagons (5 El + 8 Subway) are **permanent entities created once by `CTrain::InitTrains()`** at game
initialisation. The script layer cannot spawn additional trains.

---

## 3. Loading `tracks3.dat`

### Engine verdict: hardcoded two-track limit

The re3 open-source reimplementation confirms the limit unambiguously. `CTrain::InitTrains()` contains exactly two calls
to `ReadAndInterpretTrackFile`:

```cpp
// El Train
ReadAndInterpretTrackFile("data\\paths\\tracks.dat",
    &pTrackNodes, &NumTrackNodes, 3, StationDist, ...);

// Subway
ReadAndInterpretTrackFile("data\\paths\\tracks2.dat",
    &pTrackNodes_S, &NumTrackNodes_S, 4, StationDist_S, ...);
```

There is no loop, no config file listing tracks, no extension mechanism. The track system is built on **two completely
separate sets of module-static globals**.

> Note: `thelink2012/modloader` lists `tracks3.dat` and `tracks4.dat` in its GTA III plugin — those are dead entries.
> They are Vice City's plane track files; GTA III never requests them.

### Could CLEO Redux memory-patch a third track?

**Technically yes, practically equivalent to writing a C++ ASI.** The steps would be:

1. Allocate heap memory for the third track's node array (`Memory.allocate`).
2. Call `ReadAndInterpretTrackFile` by address via `CALL_FUNCTION` to populate it from `tracks3.dat`.
3. Patch the `if (m_nTrackId == TRACK_SUBWAY) ... else ...` branch in `ProcessControl()` into a 3-way switch (requires
   hand-assembling a x86 code cave and writing it with `Memory.write`).
4. Patch the `UpdateTrains()` engine-position arrays to include a third slot.

Step 3 alone requires writing a JMP trampoline into the `.text` segment of the EXE — 30–50 bytes of hand-assembled x86.
This is technically possible in CLEO Redux JavaScript but is extremely brittle (version-specific absolute addresses) and
semantically equivalent to a compiled ASI. **There is no meaningful advantage over a proper C++ plugin for this step.**

### Node count limit per file

No hardcoded cap on the node array itself (dynamically allocated). The scratch `work_buff` is ≈55,000 bytes, allowing
roughly **1,800–2,000 nodes** per file in text form — well above the existing 557-node subway. Appending nodes to
`tracks2.dat` is safe within this limit.

---

## 4. Starting Trains on the New Tracks

### How track assignment works (re3 source)

Each `CTrain` struct contains a single `uint8` field:

```
m_nTrackId   uint8   at offset CTrain* + 0x29C
```

Values: `0` = TRACK_ELTRAIN (`tracks.dat`), `1` = TRACK_SUBWAY (`tracks2.dat`).

`ProcessControl()` reads this field every game tick:

```cpp
if (m_nTrackId == TRACK_SUBWAY) {
    trackNodes = pTrackNodes_S;
    // ... subway globals
} else {
    trackNodes = pTrackNodes;
    // ... El Train globals
}
```

Writing `2` to this byte would redirect a wagon to a hypothetical third track, but only if `ProcessControl()` has been
patched to handle that value (otherwise it silently falls through to the El Train branch).

### What CLEO Redux can do without patching

A CLEO Redux TypeScript script can, without any ASI companion:

- Read any wagon's `m_nTrackId` via `READ_MEMORY` (after finding the `CTrain*` pointer).
- Write `m_nTrackId = 1` to redirect an El Train wagon onto the Subway track, or vice versa.
- Read/write `m_fSpeed` (`CTrain* + 0x294`) to control train speed.
- Read `m_nCurTrackNode` (`CTrain* + 0x290`) to track progress along the route.

These capabilities are sufficient if the new light rail route is **encoded into `tracks2.dat`** (subway extension). The
TypeScript plugin can monitor progress and trigger station events without needing a third track or any patching.

---

## 5. Decision Tree and Recommendation

```
Can we add a genuine third track (tracks3.dat)?
│
├─ With CLEO Redux TypeScript alone? ──────────────── NO
│    Requires patching ProcessControl(), which is C++ ASI territory.
│
├─ With a companion C++ ASI plugin? ───────────────── YES, but...
│    • ~400 LOC C++ (plugin-sdk + MinHook)
│    • Hooks InitTrains, ProcessControl, UpdateTrains
│    • Adds significant build/maintenance complexity
│    • Installer must ship the ASI alongside the TypeScript plugin
│
└─ Without a third track (extend tracks2.dat)? ──── YES ✓  (Recommended)
     • Append new light rail nodes to the existing subway loop file
     • Both subway trains AND new light rail service share the path
     • CLEO Redux TypeScript plugin handles station detection,
       door/camera events, passenger logic entirely in script space
     • Model changes (custom train visual) require IMG/IDE edit only
     • No memory patching required
```

### Recommended path: Extend `tracks2.dat`

**Pros:**

- Zero C++ required. The TypeScript plugin is self-contained.
- `tracks2.dat` already crosses all three islands — the new route can branch geometrically.
- Node count capacity is ample (~1,800 max vs 557 existing).
- Station behaviour, speed control, and camera triggers all live in the TypeScript plugin.

**Cons:**

- Subway wagons will also travel the new light rail segment. The in-game visual result depends on exact route geometry —
  if the new segment is physically distinct (elevated, different z-level) this may be acceptable or even desirable.
- Station stop count is baked into a fixed-size array (`aLineBits_S[18]`). Adding stops beyond 18 requires patching two
  bytes in the EXE. This is a trivial one-line CLEO `WRITE_MEMORY` call but is a hard dependency.

**If genuinely separate train types are required** (El-style wagons on one path, subway-style on another), a companion
ASI plugin is unavoidable. Log this as a future phase and proceed with the `tracks2.dat` extension approach first.

---

## 6. What the TypeScript Plugin Can Do (Summary)

Even without a companion ASI, the `plugins/light-rail/index.ts` plugin can:

| Capability                                 | Mechanism                                               |
| ------------------------------------------ | ------------------------------------------------------- |
| Detect when a train reaches a station node | `READ_MEMORY` on `m_nCurTrackNode` each tick            |
| Play station announcements / open doors    | Native audio/animation opcodes                          |
| Control train speed at stations            | `WRITE_MEMORY` on `m_fSpeed`                            |
| Display custom blips and UI for stations   | Native map/radar opcodes                                |
| Request and manage custom train model      | `0247` `REQUEST_MODEL` + `038B` `LOAD_REQUESTED_MODELS` |
| Release model when no longer needed        | `0249` `RELEASE_MODEL`                                  |
| Guard against non-GTA3 hosts               | `if (HOST !== "gta3" && HOST !== "re3") exit(...)`      |

---

## Sources

- re3 source: `src/vehicles/Train.cpp`, `src/vehicles/Train.h`
- [GTAMods Wiki — Train.dat](https://gtamods.com/wiki/Train.dat)
- [GTAMods Wiki — Resource Streaming](https://gtamods.com/wiki/Streaming)
- [Sanny Builder Library — GTA III](https://library.sannybuilder.com/#/gta3)
- [CLEO Redux docs — Script Lifecycle](https://re.cleo.li/docs/en/script-lifecycle.html)
- [CLEO Redux docs — TypeScript](https://re.cleo.li/docs/en/typescript.html)
- [CLEO Redux SDK — using-sdk.html](https://re.cleo.li/docs/en/using-sdk.html)
