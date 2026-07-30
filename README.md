# HI Dog Maps 🐾

An interactive map of dog-friendly places across Hawai‘i: dog parks, leash-allowed parks and beaches, trails, and dog-welcoming restaurant patios. Covers O‘ahu, Maui, Kaua‘i, and Hawai‘i Island.

**🌺 Live site: https://hawaiidogmap.com** (also works: https://shaunagits.github.io/hi-dog-maps/)

## Features

- **Custom vector map** (MapLibre GL + [OpenFreeMap](https://openfreemap.org), recolored to a brand palette) with a gentle 3D tilt, sky, and Esri shaded relief and satellite imagery.
- Every place gets its own marker, no clustering, plus category **line-icons** (paw / tree / waves / mountain / utensils) shared between pins, filters, and the list view.
- **Search** (name / region / island / address), **filters** by leash rule and category with live result counts, and a one-click reset.
- **List view**: browse every filtered place as a scrollable list instead of the map. Useful on its own, and doubles as real, indexable content for search engines.
- **Detail panel** per place: description, dog rules, hours, amenities, and a **Get directions** link. Slides in from the side (a bottom sheet on mobile) without blocking the map, so you can keep browsing while it's open.
- **Geolocate control** to find what's near you, regardless of which island you're on. No island picker: it's one continuous map.
- One **Map / Satellite / List** toggle group in the filter bar for how you want to view the results.
- **Accuracy first**: places where the dog policy is commonly claimed but not officially confirmed carry a "Verify before visiting" badge.
- SEO/social basics built in: sitemap, structured data (JSON-LD), Open Graph/Twitter previews, favicons.

## Run it

Any static file server works, no build step needed:

```bash
python3 -m http.server 4174
```

Then open http://localhost:4174

## Project structure

- `index.html`: markup + floating UI (header/search, filters, list view, detail panel, About panel), SEO/social meta tags
- `css/styles.css`: styles (brand tokens in `:root`, incl. the global `--font`)
- `js/parks-data.js`: the dataset (one object per location)
- `js/app.js`: map, marker sync, search, filters, list view, detail panel, structured-data injection
- `robots.txt`, `sitemap.xml`, `manifest.json`, `favicon.ico`, `icons/`: SEO/social assets

## Adding a location

Append one object to the array in `js/parks-data.js`:

| Field | Meaning |
|---|---|
| `type` | `"off-leash"` or `"leashed"` |
| `category` | `"dog-park"` · `"park"` · `"beach"` · `"trail"` · `"patio"` |
| `lat` / `lng` | coordinates (right-click a spot in Google Maps to copy) |
| `island` | e.g. `"Oahu"`, `"Maui"`, `"Kauai"` |
| `uncertain` | `true` shows the "Verify before visiting" badge |

Plus `name`, `address`, `hours`, `description`, `dogRules`, `amenities` (array), and `region`. The map, search, filters, list view, and counts pick it up automatically.

## Data notes

Dog rules vary by island and jurisdiction, and each island's rules have to be researched separately (different county, different parks department, different Humane Society chapter).

- **O‘ahu**: beach dog rules span two jurisdictions. City & County beach parks prohibit dogs except those on the official on-leash designation list (expanded to 72 parks in Feb 2026), while the state-owned shoreline (wet sand below the high-wash line) generally allows leashed dogs except at state parks, wildlife sanctuaries, and monk-seal zones.
- **Maui**: simpler by default. Leashed dogs (10 ft max leash) are allowed at essentially all county parks and beaches, except inside the county's off-leash dog parks, where leashing isn't required.
- **Kaua‘i**: the opposite of Maui. County parks and beaches prohibit dogs entirely except by permit, so what's here comes from exceptions instead: state Forest Reserve and state park trails, one explicitly-permitted county shared-use path, and land that isn't county property at all. Dog policy turned out to be per-trail, not inferable from land ownership alone.

Rules change. Always check posted signs, and pick up after your pup. 🦴

## Tech

Plain HTML/CSS/JS, no build step. [MapLibre GL JS](https://maplibre.org), OpenFreeMap vector tiles, and Esri raster hillshade/imagery, all free, no API key.
