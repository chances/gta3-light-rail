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

| # | Name                       | Island         | Approx. Coords    | Notes                                                                    |
| - | -------------------------- | -------------- | ----------------- | ------------------------------------------------------------------------ |
| 1 | **Portland View Junction** | Portland       | `(850, -480, 22)` | El branch junction on the major road between Chinatown and Portland View |
| 2 | **Callahan**               | Portland       | `(760, -280, 8)`  | At-grade stop on the Callahan Bridge avenue, Portland side               |
| 3 | **Belleville Park**        | Staunton       | `(tbd, -280, 8)`  | West edge of Staunton Island; verify X in-game after crossing            |
| 4 | **FIA Terminal**           | Shoreside Vale | `(tbd, -1400, 6)` | Pedestrian-accessible station outside the FIA main terminal              |

### Route Segments

```
[Portland El — junction on major road between Chinatown & Portland View]
  ~(850, -480, 22)          ← branch off El viaduct; El continues its loop
        ↓ ramp descends south along major road to street grade
  ~(850, -560, 8)           ← bottom of descent ramp, turn west
        ↓ run west along the Callahan Bridge avenue median
  ~(760, -280, 8)           ← [CALLAHAN station] (Portland side)
        ↓ continue west, rise onto Callahan Bridge deck
  ~(?, -280, 14)            ← Callahan Bridge midspan
        ↓ descend off bridge onto Staunton, continue west along same avenue median
  ~(tbd, -280, 8)           ← cross Staunton Island east → west edge
  ~(tbd, -280, 8)           ← [BELLEVILLE PARK station] (west edge avenue)
        ↓ turn north along Staunton west edge avenue
        ↓ rise onto Shoreside Lift Bridge (lower deck, à la Steel Bridge, Portland OR)
  ~(tbd, -80, 14)           ← Shoreside Lift Bridge midspan
        ↓ descend off bridge into Shoreside Vale, join avenue / highway median
        ↓ continue south-southwest; highway widens and curves north toward FIA
  ~(tbd, -1200, 6)          ← highway curves north; approach FIA access road
        ↓ turn west along FIA access road
  ~(tbd, -1400, 6)          ← [FIA TERMINAL station]
```

> **Note:** `tbd` X-coordinates for Staunton and Shoreside Vale segments must be confirmed in-game. The Callahan Bridge
> avenue runs due east–west; walk the bridge on foot to read the deck Z value. The Shoreside Lift Bridge crossing is
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

1. **Junction geometry**: The El loop is counterclockwise — the branch-off node needs to be on the correct side so the
   train doesn't reverse. Inspect the node sequence near the major road between Chinatown and Portland View; the branch
   departs southward and immediately begins the descent ramp to street grade.
2. **Callahan Bridge deck height**: Estimated Z ≈ 12–15. Verify in-game by walking the bridge and reading the Z
   coordinate. The avenue approach on both sides must slope smoothly to meet the deck.
3. **Staunton Island crossing**: Confirm that the east–west avenue across Staunton Island has a median wide enough for
   at-grade track, or whether the alignment must run with traffic in the kerb lane instead.
4. ~~**Staunton west edge avenue**: Confirm the north–south avenue along the west edge of Staunton Island connects
   continuously from the Callahan Bridge avenue to the Shoreside Lift Bridge ramp, and note its X coordinate.~~
   **Resolved:** The east–west Callahan Bridge avenue intersects the north–south avenue at a T-junction; that
   north–south avenue then runs continuously north to the Shoreside Lift Bridge loop. The alignment turns north at that
   intersection rather than following a single continuous avenue from the bridge crossing.
5. ~~**Shoreside Lift Bridge lower deck**: Confirm whether the bridge geometry allows a shared lower-deck crossing (as
   on Portland's Steel Bridge). If not, the alignment may need an adjacent at-grade or elevated approach.~~
   **Resolved:** The lower deck geometry is compatible with a shared crossing.
6. **Shoreside Vale highway curve**: Confirm where the highway turns north and where the FIA access road intersection
   is; this determines the precise location of the turn-west waypoint and the future FIA station.
7. **FIA terminal pedestrian access**: The future Phase 3 FIA station should terminate within walking distance of the
   main terminal entrance. Survey the FIA apron perimeter in-game to identify a suitable spot.
