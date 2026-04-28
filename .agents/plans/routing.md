# Light Rail Route Planning

## Coordinate System

GTA III uses a right-handed coordinate system:
- **+X** = East, **-X** = West
- **+Y** = North, **-Y** = South
- **+Z** = Up, **-Z** = Down
- World origin (0, 0, 0) is roughly the centre of Staunton Island

## Existing Track Extents (from tracks*.dat)

### Portland El (`tracks.dat`, 168 nodes)
| Axis | Min       | Max      | Notes                        |
|------|-----------|----------|------------------------------|
| X    | 766.4     | 1326.9   | Entirely on Portland (east side) |
| Y    | -836.1    | 13.1     | North–south loop             |
| Z    | 21.7      | 42.2     | Elevated; rises ~20 units over Saint Mark's hill |

Key endpoints / extremes:
- **Northernmost node**: `(963.3, 13.1, 21.9)` — near Saint Mark's / Baillie Station
- **Southernmost node**: `(826.1, -836.1, 27.3)` — Chinatown / Kurowski Station area
- **Highest node**: `(1326.9, -585.0, 42.2)` — Saint Mark's elevated section

### Subway (`tracks2.dat`, 557 nodes)
| Axis | Min       | Max      | Notes                              |
|------|-----------|---------|------------------------------------|
| X    | -742.0    | 910.3   | Spans all three islands            |
| Y    | -1662.2   | -90.5   | Deep south (FIA) to north Portland |
| Z    | -20.9     | -6.3    | Underground throughout             |

Key endpoints / extremes:
- **Portland station**: ~`(-739.5, -648.0, -13.5)` — Red Light District / Chinatown border
- **Staunton (Bedford Point) station**: ~`(390.7, -1042.9, -13.5)` — Bedford Point
- **Staunton (Liberty Campus) station**: ~`(212.0, -173.4, -11.8)` — Liberty Campus / Rockford
- **FIA station (Shoreside Vale)**: ~`(390.7, -1662.2, -6.3)` — Francis International Airport

The subway's FIA spur runs south along X ≈ 390, from Y ≈ -981 down to Y ≈ -1662.

---

## Proposed Light Rail Connector Route

The new line branches off the **Portland El** and links to the **subway system**,
then continues to **Francis International Airport** as an at-grade or elevated
surface line (distinct from the underground subway).

### Design Principles
- Trains travel **counterclockwise** (mandatory — hardcoded engine behaviour)
- The connector is a **new third track file** (`tracks3.dat`) — do not modify the
  originals until Phase 2 prototyping is complete
- Target **Z elevation**: match the Portland El (~21–22 units) where at-grade;
  use ~5–8 units for surface-level Shoreside Vale sections
- Node spacing: ~10–15 units (consistent with existing files)

### Stations (5 planned)

| # | Name | Island | Approx. Coords | Notes |
|---|------|--------|----------------|-------|
| 1 | **Portland View / Sweeney** | Portland | `(850, -200, 22)` | Near Sweeney General Hospital, Portland View |
| 2 | **Callahan Junction** | Portland → Staunton | `(600, -180, 15)` | Descends from El height to bridge level crossing Callahan Bridge |
| 3 | **Newport** | Staunton | `(200, -200, 8)` | Newport district, interchange with subway |
| 4 | **Shoreside Terminal** | Shoreside Vale | `(-100, -900, 7)` | Pike Creek / Wichita Gardens surface stop |
| 5 | **FIA** | Shoreside Vale | `(-150, -1630, 6)` | Francis International Airport terminus |

### Route Segments

```
[Portland El junction]
  ~(850, -50, 22)           ← branch off northernmost El loop node
        ↓ descend westward, following Callahan Bridge deck
  ~(600, -180, 15)          ← Callahan Junction station
        ↓ cross to Staunton, descend to near-surface
  ~(200, -200, 8)           ← Newport station (surface interchange)
        ↓ south along Staunton west coast
        ↓ cross Shoreside Lift Bridge
  ~(-100, -900, 7)          ← Shoreside Terminal station
        ↓ south through Pike Creek / Wichita Gardens
  ~(-150, -1630, 6)         ← FIA terminus station
```

### Elevation Profile

```
Z
42 |  *                           Saint Mark's peak
   |   \
22 |----*---*---                  Portland El baseline
   |         \
15 |          *                   Callahan Bridge deck
   |           \
8  |            *---*             Staunton + Shoreside surface
6  |                 *            FIA terminus
```

---

## Open Questions (resolve in Phase 2)

1. **Junction geometry**: The El loop is counterclockwise — the branch-off
   node needs to be on the correct side so the train doesn't reverse.
   Inspect the node sequence around `(963, 13, 22)` carefully before committing.
2. **Bridge crossing**: Callahan Bridge deck height is approximately Z ≈ 12–15.
   Verify in-game before finalising Callahan Junction node Z values.
3. **Shoreside topography**: Pike Creek has hills. The route may need a short
   tunnel section or steeper grade to reach FIA.
4. **Third track file**: Confirm whether the GTA III engine supports more than
   two `tracks*.dat` files, or whether the connector must be appended to an
   existing file. If limited to two files, the connector replaces `tracks2.dat`
   and the subway nodes are preserved as a prefix.
