# GTA 3 Light Rail System

A light rail expansion mod for Grand Theft Auto III that extends the existing transit network with a new electrified
line spanning elevated viaducts, at-grade surface sections, and shared subway infrastructure across all three islands of
Liberty City.

## Features

### 🚊 Cross-Island Transit

A 5-station electrified light rail line running from Portland across the Callahan Bridge, through Staunton Island and
Shoreside Vale, to FIA. The alignment transitions from the existing elevated El viaduct, down to bridge deck level, then
to near-grade surface track through Staunton and Shoreside Vale.

| # | Station                       | Island              |
| - | ----------------------------- | ------------------- |
| 1 | Portland View / Sweeney       | Portland            |
| 2 | Callahan Junction             | Portland → Staunton |
| 3 | Newport                       | Staunton Island     |
| 4 | Shoreside Terminal            | Shoreside Vale      |
| 5 | Francis International Airport | Shoreside Vale      |

### 🛤 Track Extension

New route nodes appended to the existing subway track file (`tracks2.dat`).

### 🗺 Station Detection & HUD

A [CLEO Redux](https://re.cleo.li) TypeScript plugin (`plugins/light-rail`) handles all runtime behaviour: detecting
station arrivals via `m_nCurTrackNode`, controlling train speed at stops via `m_fSpeed`, and displaying station blips
and UI on the radar.

### 🚉 Station Stops

Scripted door events and dwell timing at each station, driven entirely by the TypeScript plugin, i.e. no ASI memory patching.

## Installation

> **Note:** The installer is not yet available. Installation will be documented here once the mod reaches a
> distributable state.

1. Install [CLEO Redux](https://re.cleo.li) for GTA III.
2. Run the installer and select your GTA III installation directory.
3. Launch GTA III — the light rail line will be active from the start of any save.

## System Requirements

- Grand Theft Auto III (Steam / Rockstar Games Launcher)
- [CLEO Redux](https://re.cleo.li) with GTA III support

## License

Licensed under Creative Commons Attribution-NonCommercial 4.0 International. See [LICENSE.md](./LICENSE.md) for details.
