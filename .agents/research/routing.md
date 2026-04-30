# Light Rail Route Planning

## Coordinate System

GTA III uses a right-handed coordinate system:

- **+X** = East, **-X** = West
- **+Y** = North, **-Y** = South
- **+Z** = Up, **-Z** = Down
- World origin (0, 0, 0) is roughly the centre of Staunton Island

## Existing Track Extents (from tracks*.dat)

### Portland El (`tracks.dat`, 168 nodes)

| Axis | Min    | Max    | Notes                                            |
| ---- | ------ | ------ | ------------------------------------------------ |
| X    | 766.4  | 1326.9 | Entirely on Portland (east side)                 |
| Y    | -836.1 | 13.1   | North–south loop                                 |
| Z    | 21.7   | 42.2   | Elevated; rises ~20 units over Saint Mark's hill |

Key endpoints / extremes:

- **Northernmost node**: `(963.3, 13.1, 21.9)` — near Saint Mark's / Baillie Station
- **Southernmost node**: `(826.1, -836.1, 27.3)` — Chinatown / Kurowski Station area
- **Highest node**: `(1326.9, -585.0, 42.2)` — Saint Mark's elevated section

### Subway (`tracks2.dat`, 557 nodes)

| Axis | Min     | Max   | Notes                              |
| ---- | ------- | ----- | ---------------------------------- |
| X    | -742.0  | 910.3 | Spans all three islands            |
| Y    | -1662.2 | -90.5 | Deep south (FIA) to north Portland |
| Z    | -20.9   | -6.3  | Underground throughout             |

Key endpoints / extremes:

- **Portland station**: ~`(-739.5, -648.0, -13.5)` — Red Light District / Chinatown border
- **Staunton (Bedford Point) station**: ~`(390.7, -1042.9, -13.5)` — Bedford Point
- **Staunton (Liberty Campus) station**: ~`(212.0, -173.4, -11.8)` — Liberty Campus / Rockford
- **FIA station (Shoreside Vale)**: ~`(390.7, -1662.2, -6.3)` — Francis International Airport

The subway's FIA spur runs south along X ≈ 390, from Y ≈ -981 down to Y ≈ -1662.

---

## Proposed Light Rail Connector Route

The new line branches off the **Portland El** and links to the **subway system**, then continues to **Francis
International Airport** as an at-grade or elevated surface line (distinct from the underground subway).

### Design Principles

- Trains travel **counterclockwise** (mandatory — hardcoded engine behaviour)
- Connector nodes are **appended to `tracks2.dat`** (see Phase 2 architecture decision) — do not modify originals until
  Phase 2 prototyping is complete
- Target **Z elevation**: match the Portland El (~21–22 units) at the elevated branch junction; use ~7–8 units for
  at-grade Portland and Staunton sections; ~6–7 units for Shoreside Vale highway
- Node spacing: ~10–15 units (consistent with existing files)

### Stations (4 planned)

> Additional intermediate stops can be added in a later phase once the base route is proven.

| # | Name                  | Island         | Approx. Coords                              | Notes                                                                     |
| - | --------------------- | -------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| 1 | **Kurowski Junction** | Portland       | `(1062.03, -817.172, 28.1319)`              | Southernmost El station; connector departs south then west at Z = 28.1319 |
| 2 | **Callahan**          | Portland       | `(tbd, tbd, 38.7339)`                       | On the Callahan Bridge deck; X/Y to be confirmed during node authoring    |
| 3 | **Belleville Park**   | Staunton       | `(41.8152, -941.429, 24.9781)`              | West edge of Staunton Island, east–west avenue from Callahan Bridge       |
| 4 | **FIA Terminal**      | Shoreside Vale | `(-718.903, -471.234 to -541.234, 7.54311)` | North end of platform at Y = -471.234; south end at Y = -541.234          |

### Route Segments

```
[Portland El — southernmost station, Kurowski / Chinatown]
  (1062.03, -817.172, 28.1319) ← [KUROWSKI JUNCTION] depart El, run south
        ↓ continue south at Z = 28.1319
        ↓ turn west, run west at Z = 28.1319
        ↓ ascend ramp to Callahan Bridge deck
  (tbd, tbd, 38.7339)       ← [CALLAHAN station] on bridge deck
        ↓ continue west across Callahan Bridge
        ↓ descend off bridge onto Staunton, continue west along same avenue median
  (41.8152, -941.429, 24.98)  ← [BELLEVILLE PARK station]
        ↓ arc northward along west-edge avenue; arc peaks at Z ≈ 31.11
  (-72.6674, -912.156, 31.113) ← arc complete, heading north
        ↓ run north along west-edge avenue (X ≈ -72.67)
  (-72.6833, -657.551, 25.142) ← meets loop road to Shoreside Lift Bridge
        ↓ rise onto Shoreside Lift Bridge road deck
  (-150.87, -621.497, 40.996) ← Shoreside Lift Bridge deck
        ↓ continue across bridge
  (-555.849, -630.904, 46.5948) ← bridge crossing ends
        ↓ arc northward, descending
  (-655.477, -517.937, 25.9064) ← lift_bridge_descender_end; arc complete
        ↓ second arc, descending south to street grade
  (-718.903, -471.234, 7.54311) ← arc ends, train faces south
        ↓ platform run southward
  (-718.903, -541.234, 7.54311) ← [FIA TERMINAL station] south end of platform
```

> **Note:** The Callahan station X/Y remains to be pinned during node authoring. The Shoreside Lift Bridge crossing is
> modelled after the real-life **Steel Bridge** in Portland, Oregon, where light rail (MAX) shares the lower deck of the
> lift span with road traffic.

### Elevation Profile

```
Z
42 |  *                                    Saint Mark's peak
   |   \
22 |----*---[junction]                     Portland El baseline / branch junction
   |            \
14 |             \       *         *       Callahan Bridge deck / Shoreside Lift Bridge deck
   |              \     / \       / \
8  |               *---*   *-----*   *---  At-grade: Portland avenue, Staunton crossing,
   |                                  \    Staunton west edge, Shoreside Vale highway
6  |                                   *   FIA terminal approach
```

---

## Open Questions (resolve in Phase 2)

1. **Junction geometry**: Confirmed. Connector departs from the southernmost El station at
   `(1062.03, -817.172, 28.1319)`, running south then west at that elevation before ramping up to the bridge.
2. **Callahan Bridge deck height**: Confirmed `Z = 38.7339`. Approach ramp ascends from `Z = 28.1319`.
3. **Staunton Island crossing**: Confirmed. Belleville Park station at `(41.8152, -941.429, 24.9781)`. Line arcs
   northward at the west-edge T-junction, peaking at `(-72.6674, -912.156, 31.113)`, then runs north to
   `(-72.6833, -657.551, 25.1422)` where it meets the Shoreside Lift Bridge loop road. Bridge deck at
   `(-150.87, -621.497, 40.9961)`.
4. ~~**Staunton west edge avenue**: Confirm the north–south avenue along the west edge of Staunton Island connects
   continuously from the Callahan Bridge avenue to the Shoreside Lift Bridge ramp, and note its X coordinate.~~
   **Resolved:** The east–west Callahan Bridge avenue intersects the north–south avenue at a T-junction; that
   north–south avenue then runs continuously north to the Shoreside Lift Bridge loop. The alignment turns north at that
   intersection rather than following a single continuous avenue from the bridge crossing.
5. ~~**Shoreside Lift Bridge lower deck**: Confirm whether the bridge geometry allows a shared lower-deck crossing (as
   on Portland's Steel Bridge). If not, the alignment may need an adjacent at-grade or elevated approach.~~
   **Resolved:** The lower deck geometry is compatible with a shared crossing.
6. **Shoreside Lift Bridge descent**: Confirmed. Bridge crossing ends at `(-555.849, -630.904, 46.5948)`. Arc northward
   descends to `lift_bridge_descender_end` at `(-655.477, -517.937, 25.9064)`.
7. **FIA terminal station**: Confirmed. Second arc from `lift_bridge_descender_end` arrives southward-facing at
   `(-718.903, -471.234, 7.54311)`. Platform runs south to `(-718.903, -541.234, 7.54311)`.
