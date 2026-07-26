# HI Dog Maps 🐾

An interactive map of dog-friendly places on O‘ahu, Hawai‘i — dog parks, leash-allowed parks and beaches, trails, and dog-welcoming restaurant patios.

**🌺 Live site: https://shaunagits.github.io/hi-dog-maps/**

## Features

- **Custom vector map** of O‘ahu (MapLibre GL + [OpenFreeMap](https://openfreemap.org), recolored to a brand palette) with a gentle 3D tilt, sky, and Esri shaded relief.
- **Marker clustering**, category **line-icons** (paw / tree / waves / mountain / utensils), and a **Map / Satellite** toggle.
- **Search** (name / region / address) and **filters** by leash rule and category.
- **Detail modal** per place: description, dog rules, hours, amenities, and a **Get directions** link.
- **Accuracy first** — places where the dog policy is commonly claimed but not officially confirmed carry a "Verify before visiting" badge.

## Run it

Any static file server works — no build step:

```bash
python3 -m http.server 4174
```

Then open http://localhost:4174

## Project structure

- `index.html` — markup + floating UI (header/search, filters, basemap toggle, modal)
- `css/styles.css` — styles (brand tokens in `:root`, incl. the global `--font`)
- `js/parks-data.js` — the dataset (one object per location)
- `js/app.js` — map, clustering, search, filters, modal

## Adding a location

Append one object to the array in `js/parks-data.js`:

| Field | Meaning |
|---|---|
| `type` | `"off-leash"` or `"leashed"` |
| `category` | `"dog-park"` · `"park"` · `"beach"` · `"trail"` · `"patio"` |
| `lat` / `lng` | coordinates (right-click a spot in Google Maps to copy) |
| `uncertain` | `true` shows the "Verify before visiting" badge |

Plus `name`, `address`, `hours`, `description`, `dogRules`, `amenities` (array), and `region`. The map, search, filters, and counts pick it up automatically.

## Data notes

Beach dog rules on O‘ahu span two jurisdictions: **City & County beach parks** prohibit dogs except those on the official on-leash designation list (expanded to 72 parks in Feb 2026), while the **state-owned shoreline** (wet sand below the high-wash line) generally allows leashed dogs except at state parks, wildlife sanctuaries, and monk-seal zones. Rules change — always check posted signs, and pick up after your pup. 🦴

## Tech

Plain HTML/CSS/JS, no build step. [MapLibre GL JS](https://maplibre.org), OpenFreeMap vector tiles, and Esri raster hillshade/imagery — all free, no API key.
