/* Hawaii Dog Map — native MapLibre GL implementation */
(function () {
  "use strict";

  const CATEGORY_LABEL = {
    "dog-park": "Dog park",
    "park": "Park",
    "beach": "Beach",
    "trail": "Trail",
    "patio": "Patio"
  };

  // Clean line-icon set (Lucide) drawn into markers, hero, etc.
  const CATEGORY_ICON_PATHS = {
    "dog-park":
      '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/>' +
      '<path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
    "park":
      '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>',
    "beach":
      '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.5 0 2.5 2 5 2s2.5-2 5-2c1.3 0 1.9.5 2.5 1"/>' +
      '<path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1"/>' +
      '<path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1"/>',
    "trail": '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
    "patio":
      '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/>' +
      '<path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>'
  };

  function catIcon(cat, size, stroke) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' +
      (stroke || "#fff") + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      (CATEGORY_ICON_PATHS[cat] || "") + "</svg>";
  }

  /* Brand palette for the custom vector style. */
  const MAP_COLORS = {
    land: "#f4ecdc",
    water: "#a7dbe2",
    green: "#cfe8cd",
    building: "#e9e0cf",
    road: "#ffffff",
    roadCasing: "#e6dcc8",
    label: "#3f4b5b",
    labelHalo: "#ffffff"
  };

  // Font used for map-canvas labels (must exist in the glyph server).
  // Swap here once Urbanist glyph tiles are hosted; see --font-map-label in CSS.
  // Note this one is NOT ours to pick freely: it has to be a fontstack the tile
  // server publishes, so the map's own place labels stay Noto Sans regardless of
  // what the UI uses. Noto covers the ʻokina, so island names still render right.
  const MAP_LABEL_FONT = ["Noto Sans Regular"];

  /* Recolor an OpenMapTiles-schema style (OpenFreeMap) into the brand palette. */
  function brandStyle(style) {
    (style.layers || []).forEach(function (ly) {
      const id = ly.id || "";
      const sl = ly["source-layer"] || "";
      ly.paint = ly.paint || {};
      if (ly.type === "background") {
        ly.paint["background-color"] = MAP_COLORS.land;
      } else if (sl === "water" || /water|ocean|sea|bay/i.test(id)) {
        if (ly.type === "fill") ly.paint["fill-color"] = MAP_COLORS.water;
        if (ly.type === "line") ly.paint["line-color"] = MAP_COLORS.water;
      } else if (sl === "waterway") {
        if (ly.type === "line") ly.paint["line-color"] = MAP_COLORS.water;
      } else if (sl === "landcover" || sl === "park" ||
                 /wood|forest|grass|park|landcover|wetland|cemetery|golf|pitch|garden|scrub/i.test(id)) {
        if (ly.type === "fill") ly.paint["fill-color"] = MAP_COLORS.green;
      } else if (sl === "building" || /building/i.test(id)) {
        if (ly.type === "fill") {
          ly.paint["fill-color"] = MAP_COLORS.building;
          ly.paint["fill-outline-color"] = MAP_COLORS.roadCasing;
        }
      } else if (sl === "transportation" || /road|street|highway|motorway|bridge|tunnel/i.test(id)) {
        if (ly.type === "line") {
          ly.paint["line-color"] = /casing|outline/i.test(id) ? MAP_COLORS.roadCasing : MAP_COLORS.road;
        }
      } else if (ly.type === "symbol") {
        ly.paint["text-color"] = MAP_COLORS.label;
        ly.paint["text-halo-color"] = MAP_COLORS.labelHalo;
        ly.paint["text-halo-width"] = 1.4;
      }
    });
    return style;
  }

  /* Add shaded relief + satellite into the initial style.
     Uses Esri's CORS-enabled raster hillshade (the free terrarium DEM has no CORS,
     so WebGL can't use it for true terrain/hillshade/contours without an API key). */
  function augmentStyle(style) {
    brandStyle(style);
    style.sources = style.sources || {};

    style.sources.hillshade = {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Hillshade/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
      attribution: "Hillshade &copy; Esri"
    };
    // Insert relief above land/water fills but beneath the first symbol (label) layer.
    let firstSymbol = style.layers.length;
    for (let i = 0; i < style.layers.length; i++) {
      if (style.layers[i].type === "symbol") { firstSymbol = i; break; }
    }
    style.layers.splice(firstSymbol, 0, {
      id: "hillshade",
      type: "raster",
      source: "hillshade",
      paint: { "raster-opacity": 0.28, "raster-saturation": -1 }
    });

    style.sources.satellite = {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics"
    };
    style.layers.push({ id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } });
    return style;
  }

  function rasterFallbackStyle() {
    return {
      version: 8,
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        carto: {
          type: "raster",
          tiles: ["https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
                  "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap &copy; CARTO'
        },
        satellite: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256, maxzoom: 19, attribution: "Imagery &copy; Esri"
        }
      },
      layers: [
        { id: "carto", type: "raster", source: "carto" },
        { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } }
      ]
    };
  }

  /* ---------- State + features ---------- */
  const state = { filterType: "all", filterCat: "all", query: "" };

  function matchesQuery(p) {
    if (!state.query) return true;
    const hay = (p.name + " " + (p.region || "") + " " + (p.island || "") + " " + (p.address || "") + " " +
      (CATEGORY_LABEL[p.category] || "")).toLowerCase();
    return hay.indexOf(state.query) !== -1;
  }

  function passesFilters(p) {
    const typeOk = state.filterType === "all" || p.type === state.filterType;
    const catOk = state.filterCat === "all" || p.category === state.filterCat;
    return typeOk && catOk && matchesQuery(p);
  }

  function visibleParks() { return PARKS.filter(passesFilters); }

  function featureFor(p, idx) {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        idx: idx, name: p.name, type: p.type, category: p.category,
        region: p.region || "", uncertain: p.uncertain ? 1 : 0
      }
    };
  }

  function currentFeatures() {
    const feats = [];
    PARKS.forEach(function (p, idx) { if (passesFilters(p)) feats.push(featureFor(p, idx)); });
    return { type: "FeatureCollection", features: feats };
  }

  /* ---------- Map ---------- */
  let map = null;
  const countEl = document.getElementById("result-count");

  function buildMap(style) {
    map = new maplibregl.Map({
      container: "map",
      style: style,
      // Rough midpoint of the four covered islands (O'ahu/Maui/Kaua'i/Hawai'i
      // Island) — fitAll() jumps to the real fitted view on load anyway, this
      // just keeps the very first frame (before data loads) reasonable. Nudged
      // south-east and zoomed out when Hawai'i Island was added.
      center: [-157.0, 20.6],
      zoom: 7.0,
      // Floor the zoom-out. Past this there is only empty Pacific that will
      // never fill in. (Pin pile-up used to be the other half of this reason;
      // clustering handles that now, but the empty-ocean half still stands.)
      //
      // Deliberately loose, because the zoom that fits all four islands
      // depends on viewport width — roughly 6.35 at 320px, 6.6 at 375px, 7.0
      // at 508px, 8.3 at 1280px (the chain spans ~5.5° of longitude). 6 sits
      // below the tightest of those, so "zoom out to see everything" still
      // works on the narrowest phone. Anything tighter would break that on
      // small screens. No maxBounds on purpose: that one creates invisible
      // walls, and would clamp panning for someone whose geolocate puts them
      // on the mainland.
      minZoom: 6,
      pitch: 20,
      bearing: 0,
      maxPitch: 72,
      attributionControl: false,
      dragRotate: true
    });
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Park &amp; beach data: <a href="https://www.honolulu.gov/dpr/dog-parks/" target="_blank" rel="noopener">Honolulu DPR</a>, ' +
        '<a href="https://www.hawaiianhumane.org/dog-friendly-parks/" target="_blank" rel="noopener">Hawaiian Humane Society</a>, ' +
        '<a href="https://www.mauicounty.gov/119/Parks-Recreation" target="_blank" rel="noopener">Maui County Parks &amp; Recreation</a>, ' +
        '<a href="https://www.mauihumanesociety.org/beach-buddies-resource-page/" target="_blank" rel="noopener">Maui Humane Society</a>, ' +
        '<a href="https://dlnr.hawaii.gov/recreation/nah/" target="_blank" rel="noopener">Hawaiʻi DOFAW/Nā Ala Hele</a> ' +
        '<a href="https://kauaihumane.org/" target="_blank" rel="noopener">Kauaʻi Humane Society</a>, ' +
        '<a href="https://geoportal.hawaii.gov/" target="_blank" rel="noopener">Hawaiʻi Statewide GIS</a> ' +
        '&amp; <a href="https://hihs.org/" target="_blank" rel="noopener">Hawaiʻi Island Humane Society</a>'
    }), "bottom-right");
    // Zoom + geolocate stack top-right so the bottom stays free for filters.
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true
    }), "top-right");
    // Run setup once — 'load' can be missed if the first render is gated (e.g. the
    // container wasn't laid out / compositing yet), so 'idle' + a poll are fallbacks.
    let setupDone = false;
    function ready() {
      if (setupDone) return;
      setupDone = true;
      onMapLoad();
    }
    map.on("load", ready);
    map.on("idle", ready);
    // Fallback for embeds that gate the initial render: once the style is up,
    // force a resize/repaint, run setup, then nudge the marker sync.
    let tries = 0;
    const poll = setInterval(function () {
      tries++;
      try {
        if (map.isStyleLoaded()) {
          map.resize();
          ready();
          map.triggerRepaint();
          clearInterval(poll);
          setTimeout(function () {
            try { map.resize(); map.panBy([1, 1], { duration: 0 }); syncMarkers(); map.triggerRepaint(); } catch (e) {}
          }, 250);
        }
      } catch (e) {}
      if (tries > 40) clearInterval(poll);
    }, 250);
  }

  function onMapLoad() {
    // Sky / atmosphere (no DEM needed)
    try {
      map.setSky({
        "sky-color": "#8fc7e8",
        "sky-horizon-blend": 0.6,
        "horizon-color": "#eaf4f2",
        "horizon-fog-blend": 0.6,
        "fog-color": "#e9f2ee",
        "fog-ground-blend": 0.4
      });
    } catch (e) {}

    // Location points, clustered. Zoomed out, 289 individual pins overlap into
    // an unreadable smudge (and O'ahu's 152 are the worst of it), so nearby
    // places collapse into one counted bubble until you zoom past
    // CLUSTER_MAX_ZOOM, at which point every pin is drawn individually again.
    //
    // clusterProperties tallies the off-leash share so the bubble can carry the
    // same green/blue meaning the individual pins do (see clusterEl()) — without
    // it a cluster would be a colourless dot that throws away the one attribute
    // the map is actually about.
    map.addSource("points", {
      type: "geojson",
      data: currentFeatures(),
      cluster: true,
      clusterRadius: CLUSTER_RADIUS,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
      clusterProperties: {
        offleash: ["+", ["case", ["==", ["get", "type"], "off-leash"], 1, 0]]
      }
    });
    // Invisible hit layer so the source loads + is queryable via querySourceFeatures.
    map.addLayer({ id: "points-hit", type: "circle", source: "points",
      paint: { "circle-radius": 0, "circle-opacity": 0 } });

    map.on("render", syncMarkers);
    map.on("idle", syncMarkers);
    map.on("moveend", syncMarkers);
    refresh();
    fitAll(false);
    syncMarkers();
  }

  /* ---------- HTML marker sync (pins + clusters) ---------- */
  // Grouping radius in screen pixels. A pin is 36px wide, so 60 means two
  // bubbles never touch — smaller values leave overlapping pairs behind at the
  // island-wide zooms this exists to clean up.
  const CLUSTER_RADIUS = 60;
  // Above this zoom nothing is grouped. ~14 is street level: by then the pins
  // are genuinely distinguishable places you'd walk between, and grouping them
  // would hide the one thing you zoomed in to see.
  const CLUSTER_MAX_ZOOM = 13;

  const markers = {};
  let markersOnScreen = {};

  function pinEl(props) {
    const park = PARKS[props.idx];
    const cls = props.type === "off-leash" ? "paw-marker-offleash" : "paw-marker-leashed";
    const el = document.createElement("div");
    el.className = "map-pin";
    el.innerHTML =
      '<div class="paw-marker ' + cls + '"><span>' + catIcon(props.category, 17) + "</span></div>" +
      '<div class="marker-tip">' + escapeHtml(props.name) + "</div>";
    el.addEventListener("click", function (e) { e.stopPropagation(); openModal(park); });
    return el;
  }

  /* A grouped bubble standing in for `point_count` nearby places. The ring is a
     conic gradient split by the off-leash share, so the cluster keeps the same
     colour language as the pins it replaced — a mostly-green bubble is a
     mostly-off-leash area at a glance, before you zoom in at all. */
  function clusterEl(props, coords) {
    const count = props.point_count;
    const offleash = props.offleash || 0;
    const pct = count ? Math.round((offleash / count) * 100) : 0;
    const size = count < 10 ? "cluster-sm" : (count < 50 ? "cluster-md" : "cluster-lg");
    const el = document.createElement("div");
    el.className = "cluster-pin " + size;
    el.innerHTML =
      '<div class="cluster-ring" style="--offleash-pct:' + pct + '%">' +
        '<div class="cluster-body">' + (props.point_count_abbreviated || count) + "</div>" +
      "</div>" +
      '<div class="marker-tip">' + count + " places · " + offleash + " off-leash</div>";
    el.addEventListener("click", function (e) {
      e.stopPropagation();
      zoomToCluster(props.cluster_id, coords);
    });
    return el;
  }

  /* Clicking a cluster zooms exactly far enough to break it apart — one step,
     not a guess. */
  function zoomToCluster(clusterId, coords) {
    const src = map.getSource("points");
    if (!src) return;
    const guess = function () { return map.getZoom() + 2; };
    const go = function (zoom) {
      if (typeof zoom !== "number" || !isFinite(zoom)) zoom = guess();
      // Never overshoot: for near-coincident places supercluster reports an
      // expansion zoom up in the high teens, which would slam the camera from
      // island view to rooftop in one tap. One step past CLUSTER_MAX_ZOOM
      // already guarantees the group is fully broken up, since nothing is
      // clustered at all beyond that.
      map.easeTo({ center: coords, zoom: Math.min(zoom, CLUSTER_MAX_ZOOM + 1), duration: 600 });
    };
    // Promise-based in MapLibre v4, and it round-trips to the worker, so it can
    // reject. A tapped bubble that doesn't move the camera reads as a broken
    // map, so every failure path still zooms — two levels in splits most
    // groups, and anything it doesn't split can just be tapped again.
    try {
      Promise.resolve(src.getClusterExpansionZoom(clusterId))
        .then(go)
        .catch(function () { go(guess()); });
    } catch (e) {
      go(guess());
    }
  }

  function syncMarkers() {
    if (!map.isSourceLoaded("points")) return;
    const newMarkers = {};
    const features = map.querySourceFeatures("points");
    for (let i = 0; i < features.length; i++) {
      const props = features[i].properties;
      let id, marker;
      if (props.cluster) {
        // A cluster has no fixed real-world home, so unlike a pin it does take
        // its position from the (tile-quantized) feature geometry. Set once at
        // creation — a cluster_id identifies one group at one zoom, so it never
        // needs re-positioning and never picks up the frame-to-frame jitter.
        id = "c" + props.cluster_id;
        marker = markers[id];
        if (!marker) {
          const coords = features[i].geometry.coordinates;
          marker = markers[id] = new maplibregl.Marker({ element: clusterEl(props, coords), anchor: "center" })
            .setLngLat(coords);
        }
      } else {
        // Pins never move — anchor once to the EXACT data coordinate.
        // (querySourceFeatures geometry is tile-quantized and jitters frame to frame.)
        id = "p" + props.idx;
        marker = markers[id];
        if (!marker) {
          const park = PARKS[props.idx];
          marker = markers[id] = new maplibregl.Marker({ element: pinEl(props), anchor: "bottom" })
            .setLngLat([park.lng, park.lat]);
        }
      }
      newMarkers[id] = marker;
      if (!markersOnScreen[id]) marker.addTo(map);
    }
    for (const id in markersOnScreen) {
      if (!newMarkers[id]) {
        markersOnScreen[id].remove();
        // Pins are a fixed set of 289, so caching them all is bounded and worth
        // it. Clusters are not: there's a different grouping at every zoom and
        // every filter combination, so keeping them would pile up detached
        // nodes for the whole session. Drop them and rebuild on demand.
        if (id.charAt(0) === "c") delete markers[id];
      }
    }
    markersOnScreen = newMarkers;
  }

  function clearClusterMarkers() {
    for (const id in markersOnScreen) {
      if (id.charAt(0) !== "c") continue;
      markersOnScreen[id].remove();
      delete markersOnScreen[id];
      delete markers[id];
    }
  }

  function fitAll(animate) {
    const fc = currentFeatures();
    if (!map || !fc.features.length) return;
    const b = new maplibregl.LngLatBounds();
    fc.features.forEach(function (f) { b.extend(f.geometry.coordinates); });
    // The floating panels sit top and bottom, so wide SIDE padding buys nothing
    // — and on a 320px phone 90px each side ate 56% of the viewport, pushing the
    // fit-everything zoom down to 5.37 and colliding with minZoom. Narrow the
    // sides on small screens; that lifts the tightest fit to ~6.33 and keeps
    // "zoom out to see all four islands" working on the smallest phone.
    const side = window.innerWidth <= 560 ? 24 : 90;
    // Bottom clears the filter panel, whose height is MEASURED, not assumed: it
    // wraps to three rows on a phone (~152px) and sits on one row on a desktop
    // (~70px). CLUSTER_OVERHANG is added on top because the southernmost marker
    // at these zooms is a cluster bubble, and bubbles are centre-anchored — half
    // of a 60px one hangs BELOW its coordinate, where a pin sits entirely above
    // its own.
    const panel = document.querySelector(".filter-panel");
    const panelH = panel ? Math.ceil(panel.getBoundingClientRect().height) : 90;
    const CLUSTER_OVERHANG = 34;
    // Roomiest first, then progressively less. Which padding is affordable
    // depends entirely on viewport SHAPE, so it can't be a constant:
    //   - Portrait phone (320x568): the island chain spans 4.75° of longitude
    //     against 3.26° of (Mercator) latitude, so WIDTH is what limits the fit.
    //     Vertical padding is therefore free — the full 186 leaves the zoom at
    //     ~6.33, exactly where 90 left it.
    //   - Landscape phone (812x375): almost no height to begin with, and the
    //     roomy option demands ~5.16 — below minZoom. cameraForBounds returns
    //     that happily and the map then clamps it, silently cropping islands out
    //     of a view whose whole job is showing all of them.
    // So: take the roomiest padding whose camera the map can actually adopt.
    let cam = null, tightest = null;
    const pads = [panelH + CLUSTER_OVERHANG, 120, 90, 40];
    for (let i = 0; i < pads.length; i++) {
      const c = map.cameraForBounds(b, { padding: { top: 130, bottom: pads[i], left: side, right: side }, maxZoom: 12.5 });
      if (!c) continue;
      tightest = c;
      if (c.zoom >= map.getMinZoom()) { cam = c; break; }
    }
    cam = cam || tightest;
    if (!cam) return;
    const target = { center: cam.center, zoom: cam.zoom, pitch: 20, bearing: 0 };
    if (animate) map.easeTo(Object.assign({ duration: 800 }, target));
    else map.jumpTo(target);
  }

  function refresh() {
    const fc = currentFeatures();
    if (countEl) countEl.textContent = fc.features.length;
    if (map && map.getSource("points")) {
      // Every cluster on screen was computed from the OLD filter set — its
      // count, its off-leash ring and even its position are all about to be
      // wrong. cluster_ids are reused across data updates, so a cached bubble
      // would survive the swap still showing the previous numbers. Drop them
      // all; syncMarkers rebuilds from the new data on the next frame.
      clearClusterMarkers();
      map.getSource("points").setData(fc);
    }
    updateFilterCounts();
    renderListView();
  }

  function flyToPark(park) {
    if (!map) return;
    // Keep the focused pin clear of the detail panel: on desktop the panel
    // covers the right ~440px, on narrow screens it's a bottom sheet, so
    // pad the camera on whichever side the panel will occupy.
    const mobile = window.innerWidth <= 700;
    const padding = mobile
      ? { top: 60, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 40 }
      : { top: 70, bottom: 70, left: 70, right: 440 };
    map.flyTo({ center: [park.lng, park.lat], zoom: 15, pitch: 20, bearing: 0, essential: true, duration: 900, padding: padding });
  }

  function focusPark(park) {
    flyToPark(park);
    openModal(park);
  }

  /* ---------- Nearby navigation (prev/next through neighbouring places) ---------- */
  // Opening a place builds an "outward walk" from it: the place itself, then
  // its nearest neighbours in distance order. Stepping never rebuilds the
  // list, so the walk stays anchored to wherever you started and stepping
  // back returns the way you came, rather than drifting.
  //
  // Neighbours are drawn from visibleParks(), NOT all of PARKS — if someone
  // has filtered to off-leash only, stepping into a leashed park would
  // silently contradict the filter they set.
  //
  // The distance cap matters on a multi-island map: without it, the "nearest"
  // place to a Kaua'i entry (only 9 of them) is on O'ahu, 150km across open
  // ocean, which is not a nearby place in any useful sense.
  const NEARBY_MAX_KM = 25;
  const NEARBY_MAX = 12;
  let navList = [];
  let navIndex = 0;

  function distKm(aLat, aLng, bLat, bLng) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function buildNav(anchor) {
    const near = visibleParks()
      .filter(function (p) { return p !== anchor; })
      .map(function (p) { return { p: p, d: distKm(anchor.lat, anchor.lng, p.lat, p.lng) }; })
      .filter(function (x) { return x.d <= NEARBY_MAX_KM; })
      .sort(function (a, b) { return a.d - b.d; })
      .slice(0, NEARBY_MAX - 1)
      .map(function (x) { return x.p; });
    navList = [anchor].concat(near);
    navIndex = 0;
  }

  function stepNav(delta) {
    const next = navIndex + delta;
    if (next < 0 || next >= navList.length) return;
    navIndex = next;
    const park = navList[navIndex];
    flyToPark(park);
    openModal(park, true);
  }

  function renderNav() {
    const prev = document.getElementById("modal-prev");
    const next = document.getElementById("modal-next");
    if (!prev || !next) return;
    const has = navList.length > 1;
    prev.hidden = !has;
    next.hidden = !has;
    if (!has) return;
    prev.disabled = navIndex <= 0;
    next.disabled = navIndex >= navList.length - 1;
    const p = navList[navIndex - 1], n = navList[navIndex + 1];
    prev.title = p ? "Back to " + p.name : "";
    next.title = n ? "Nearby: " + n.name : "";
  }

  /* ---------- Basemap style (Map / Satellite layer visibility) ---------- */
  // Wired up alongside the Map/Satellite/List view-toggle chips below —
  // basemap style and view mode share one button group in the filter bar.
  function setBasemap(name) {
    if (!map || !map.getLayer("satellite")) return;
    map.setLayoutProperty("satellite", "visibility", name === "satellite" ? "visible" : "none");
  }

  /* ---------- Filters ---------- */
  // Reuse the same line-icon set as the markers/hero, so filter chips read as
  // part of the same visual system instead of mismatched emoji.
  document.querySelectorAll(".chip-icon").forEach(function (el) {
    el.innerHTML = catIcon(el.getAttribute("data-icon"), 14, "currentColor");
  });

  const filterReset = document.getElementById("filter-reset");
  const resetDivider = document.getElementById("reset-divider");

  // Live per-chip counts: how many results this option would leave, given the
  // OTHER axis's current selection and the active search — so counts update
  // as you filter instead of always showing the unfiltered total.
  function updateFilterCounts() {
    document.querySelectorAll("[data-filter-type]").forEach(function (btn) {
      const t = btn.getAttribute("data-filter-type");
      const n = PARKS.filter(function (p) {
        const typeOk = t === "all" || p.type === t;
        const catOk = state.filterCat === "all" || p.category === state.filterCat;
        return typeOk && catOk && matchesQuery(p);
      }).length;
      const el = btn.querySelector(".chip-count");
      if (el) el.textContent = " (" + n + ")";
      btn.classList.toggle("chip-empty", n === 0);
    });
    document.querySelectorAll("[data-filter-cat]").forEach(function (btn) {
      const c = btn.getAttribute("data-filter-cat");
      const n = PARKS.filter(function (p) {
        const catOk = c === "all" || p.category === c;
        const typeOk = state.filterType === "all" || p.type === state.filterType;
        return catOk && typeOk && matchesQuery(p);
      }).length;
      const el = btn.querySelector(".chip-count");
      if (el) el.textContent = " (" + n + ")";
      btn.classList.toggle("chip-empty", n === 0);
    });
  }

  function updateResetVisibility() {
    const active = state.filterType !== "all" || state.filterCat !== "all";
    filterReset.hidden = !active;
    resetDivider.hidden = !active;
  }

  document.querySelectorAll("[data-filter-type]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-filter-type]").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      state.filterType = btn.getAttribute("data-filter-type");
      refresh();
      fitAll(true);
      updateResetVisibility();
    });
  });

  document.querySelectorAll("[data-filter-cat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-filter-cat]").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      state.filterCat = btn.getAttribute("data-filter-cat");
      refresh();
      fitAll(true);
      updateResetVisibility();
    });
  });

  filterReset.addEventListener("click", function () {
    state.filterType = "all";
    state.filterCat = "all";
    document.querySelectorAll("[data-filter-type]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-filter-type") === "all");
    });
    document.querySelectorAll("[data-filter-cat]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-filter-cat") === "all");
    });
    refresh();
    fitAll(true);
    updateResetVisibility();
  });

  /* ---------- List view ---------- */
  // Alternative to the map for browsing every place. Its content is rebuilt
  // by refresh() regardless of which view is active, so the text exists in
  // the DOM at load — real content for search crawlers and screen readers,
  // not something only created on demand when a user opens the panel.
  //
  // Shares one chip group with the Map/Satellite basemap toggle: viewMode
  // ("map"|"list") and basemapName ("map"|"satellite") are tracked
  // separately so returning to map view never clobbers whichever basemap
  // style was last chosen.
  let viewMode = "map";
  let basemapName = "map";
  const listView = document.getElementById("list-view");
  const listGrid = document.getElementById("list-grid");
  const listViewCount = document.getElementById("list-view-count");

  function renderListView() {
    const parks = visibleParks().slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    listViewCount.textContent = parks.length + (parks.length === 1 ? " place" : " places") +
      " matching your filters";
    if (parks.length === 0) {
      listGrid.innerHTML = '<li class="list-empty">No matches — try different filters or a different search.</li>';
      return;
    }
    listGrid.innerHTML = parks.map(function (park) {
      const dotCls = park.type === "off-leash" ? "icon-offleash" : "icon-leashed";
      return (
        '<li>' +
          '<button class="list-card" data-list-idx="' + PARKS.indexOf(park) + '">' +
            '<div class="list-card-head">' +
              '<span class="list-card-icon ' + dotCls + '">' + catIcon(park.category, 13) + "</span>" +
              '<span class="list-card-name">' + escapeHtml(park.name) + "</span>" +
            "</div>" +
            '<div class="list-card-meta">' +
              escapeHtml((CATEGORY_LABEL[park.category] || "") + " · " + (park.region || "") +
                (park.island ? ", " + park.island : "") +
                (park.type === "off-leash" ? " · Off-leash" : " · Leashed")) +
            "</div>" +
            '<p class="list-card-desc">' + escapeHtml(park.description || "") + "</p>" +
          "</button>" +
        "</li>"
      );
    }).join("");
  }

  listGrid.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-list-idx]");
    if (!btn) return;
    const park = PARKS[Number(btn.getAttribute("data-list-idx"))];
    if (!park) return;
    showMapView();
    focusPark(park);
  });

  function updateViewButtons() {
    document.querySelectorAll("[data-view]").forEach(function (b) {
      const v = b.getAttribute("data-view");
      const active = viewMode === "list" ? v === "list" : v === basemapName;
      b.classList.toggle("active", active);
    });
  }

  // Return to map view without changing whichever basemap style was active.
  function showMapView() {
    viewMode = "map";
    listView.hidden = true;
    updateViewButtons();
  }

  function setViewMode(mode) {
    if (mode === "list") {
      viewMode = "list";
      listView.hidden = false;
    } else {
      basemapName = mode; // "map" or "satellite"
      setBasemap(mode);
      viewMode = "map";
      listView.hidden = true;
    }
    updateViewButtons();
  }

  document.querySelectorAll("[data-view]").forEach(function (btn) {
    btn.addEventListener("click", function () { setViewMode(btn.getAttribute("data-view")); });
  });

  /* ---------- Modal ---------- */
  const backdrop = document.getElementById("modal-backdrop");

  // Guards against a stale photo load finishing after a newer park has
  // already been opened (openModal can be called again before a prior
  // photo's Image() has resolved) — only the most recent call may paint.
  let heroLoadToken = 0;

  // Held as a live reference, NOT re-queried per open: painting the hero clears
  // its children via innerHTML, which detaches this node from the document. A
  // fresh getElementById would then return null on the next open.
  const heroSpinner = document.getElementById("hero-spinner");

  // Replace the hero's contents while keeping the spinner node alive.
  function setHeroContent(hero, html, spinning) {
    hero.innerHTML = html;
    if (heroSpinner) {
      hero.appendChild(heroSpinner);
      heroSpinner.hidden = !spinning;
    }
  }

  // Required CC attribution for a Commons photo — never render a Commons hero
  // without it. Aerials carry their own Esri credit instead.
  function commonsCredit(park) {
    if (!park.photoCredit) return "";
    return "Photo: " + escapeHtml(park.photoCredit) +
      (park.photoLicense ? " / " + escapeHtml(park.photoLicense) : "") +
      ', via <a href="' + escapeHtml(park.photoSource || "https://commons.wikimedia.org/") +
      '" target="_blank" rel="noopener">Wikimedia Commons</a>';
  }

  // Esri World Imagery export, framed on the place's own coordinates — so it is
  // correct by construction for every entry, needs no API key, and adds no repo
  // weight. This is the middle hero tier: it covers the ~156 places that have no
  // Commons photo and realistically never will (patios, small neighbourhood
  // parks, bark parks are not subjects Commons contributors photograph).
  // Requested pixel size matters far more than you'd expect: this endpoint renders
  // each image on demand, and cost climbs steeply past ~720px wide. Measured cold,
  // same endpoint, different places: 480px 555ms | 600px 671ms | 720px 1109ms |
  // 900px 3244ms. 720x360 is the knee of that curve — still ~1.75x the hero's CSS
  // width, and roughly three times faster than the 900px version this used to request.
  const AERIAL_SPAN_M = 420; // ground width of the frame; ~2:1 suits the hero box
  const AERIAL_PX = [720, 360];
  function aerialUrl(park, w, h) {
    if (typeof park.lat !== "number" || typeof park.lng !== "number") return "";
    // bbox aspect must match the requested pixel aspect or Esri stretches it
    const halfLat = (AERIAL_SPAN_M * (h / w)) / 2 / 111320;
    const halfLng = AERIAL_SPAN_M / 2 / (111320 * Math.cos(park.lat * Math.PI / 180));
    const bbox = [park.lng - halfLng, park.lat - halfLat,
                  park.lng + halfLng, park.lat + halfLat].join(",");
    return "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery" +
      "/MapServer/export?bbox=" + bbox + "&bboxSR=4326&imageSR=3857" +
      "&size=" + w + "," + h + "&format=jpg&f=image";
  }

  // Warm the browser cache for the places either side of the current one, so
  // stepping through neighbours is instant instead of paying the load again.
  // Only the immediate neighbours — prefetching the whole walk would fire a
  // dozen on-demand aerial renders for images most people never look at.
  const prefetched = Object.create(null);
  function prefetchNeighbourHeroes() {
    [navList[navIndex - 1], navList[navIndex + 1]].forEach(function (p) {
      if (!p) return;
      const url = p.photo || aerialUrl(p, AERIAL_PX[0], AERIAL_PX[1]);
      if (!url || prefetched[url]) return;
      prefetched[url] = true;
      const img = new Image();
      img.src = url;
    });
  }

  // isStep is true only when arriving via the prev/next arrows, swipe or arrow
  // keys — a fresh selection (pin or list card) re-anchors the nearby walk.
  function openModal(park, isStep) {
    if (!isStep) buildNav(park);
    renderNav();
    const modalEl = document.querySelector("#modal-backdrop .modal");
    if (modalEl) modalEl.scrollTop = 0; // don't land mid-way down the next place
    const myToken = ++heroLoadToken;
    const hero = document.getElementById("modal-hero");
    const heroCredit = document.getElementById("modal-hero-credit");
    hero.className = "modal-hero hero-" + park.category;
    hero.style.backgroundImage = "";
    setHeroContent(hero, catIcon(park.category, 66), true);
    heroCredit.hidden = true;
    heroCredit.innerHTML = "";

    // Load off-DOM first, and only paint on a successful load — a broken URL
    // then falls through to the next tier instead of showing an empty box.
    const load = function (url, creditHtml, onFail) {
      const img = new Image();
      img.onload = function () {
        if (myToken !== heroLoadToken) return;
        hero.style.backgroundImage = "url('" + url + "')";
        setHeroContent(hero, "", false);
        hero.classList.add("hero-loaded");
        if (creditHtml) {
          heroCredit.innerHTML = creditHtml;
          heroCredit.hidden = false;
        }
      };
      img.onerror = function () {
        if (myToken !== heroLoadToken) return;
        if (onFail) { onFail(); return; }
        if (heroSpinner) heroSpinner.hidden = true; // nothing left to try; keep the icon
      };
      img.src = url;
    };

    const showAerial = function () {
      const url = aerialUrl(park, AERIAL_PX[0], AERIAL_PX[1]);
      if (!url) { if (heroSpinner) heroSpinner.hidden = true; return; } // no coords
      load(url, 'Satellite imagery &copy; <a href="https://www.esri.com/"' +
                ' target="_blank" rel="noopener">Esri</a>', null);
    };

    if (park.photo) {
      load(park.photo, commonsCredit(park), showAerial);
    } else {
      showAerial();
    }
    prefetchNeighbourHeroes();

    document.getElementById("modal-title").textContent = park.name;
    document.getElementById("modal-address").textContent = park.address || "";
    document.getElementById("modal-desc").textContent = park.description || "";
    document.getElementById("modal-dog-rules").textContent = park.dogRules || "";
    document.getElementById("modal-hours").textContent = park.hours || "Check posted signs";

    document.getElementById("modal-badges").innerHTML =
      '<span class="tag ' + (park.type === "off-leash" ? "tag-offleash" : "tag-leashed") + '">' +
        (park.type === "off-leash" ? "🐕 Off-leash" : "🦮 Leash required") +
      "</span>" +
      '<span class="tag tag-region">' + escapeHtml(CATEGORY_LABEL[park.category] || "Park") + "</span>" +
      '<span class="tag tag-region">' + escapeHtml(park.region || "") + "</span>" +
      (park.uncertain ? '<span class="tag tag-uncertain">⚠️ Verify before visiting</span>' : "");

    const amenities = document.getElementById("modal-amenities");
    amenities.innerHTML = "";
    (park.amenities || []).forEach(function (a) {
      const li = document.createElement("li");
      li.textContent = a;
      amenities.appendChild(li);
    });
    if (!park.amenities || park.amenities.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No info";
      amenities.appendChild(li);
    }

    const dest = park.lat + "," + park.lng;
    document.getElementById("modal-directions").href =
      "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest);
    document.getElementById("modal-streetview").href =
      "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(park.name + ", " + (park.address || (park.island || "Hawaii") + ", HI"));

    backdrop.hidden = false;
  }

  function closeModal() { backdrop.hidden = true; }

  document.getElementById("modal-close").addEventListener("click", closeModal);

  /* ---------- Rules & safety guide ---------- */
  // A full-page section rather than the side-panel component, so the island
  // table has room to read as a table. It also absorbed what used to be the
  // separate About panel — one page, one entry point.
  const guideEl = document.getElementById("guide");

  function openGuide(currentIsland) {
    closeModal();
    // Highlight the reader's own island when the guide is opened from a place,
    // so the table lands as "here's your rule" rather than a generic chart.
    const rows = guideEl.querySelectorAll(".guide-table tbody tr");
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("is-current",
        !!currentIsland && rows[i].getAttribute("data-island") === currentIsland);
    }
    guideEl.hidden = false;
    guideEl.scrollTop = 0;
    if (history.replaceState) history.replaceState(null, "", "#rules");
  }

  function closeGuide() {
    guideEl.hidden = true;
    if (history.replaceState) history.replaceState(null, "", location.pathname);
  }

  document.getElementById("guide-trigger").addEventListener("click", function () { openGuide(); });
  document.getElementById("guide-logo").addEventListener("click", function () { openGuide(); });
  document.getElementById("guide-close").addEventListener("click", closeGuide);
  // Opened from a place, so pass its island through to highlight that row.
  document.getElementById("guide-link").addEventListener("click", function (e) {
    e.stopPropagation();
    const p = navList[navIndex];
    openGuide(p ? p.island : null);
  });

  // Deep link: /#rules opens the guide directly, so it can be linked to from
  // anywhere and crawlers have a stable URL for it.
  if (location.hash === "#rules") openGuide();

  // Click outside the detail panel closes it. The backdrop itself is
  // pointer-events:none (see CSS), so clicks on the map/markers/filter bar
  // reach their real targets first — a marker's own click handler already
  // calls stopPropagation() (swap content, don't close), and a list-card
  // click already manages the panel itself, so both are excluded here to
  // avoid this listener immediately undoing what they just did. The guide
  // triggers are excluded since opening the guide is itself a click "outside"
  // the (now-closing) detail panel.
  document.addEventListener("click", function (e) {
    if (e.target.closest(".modal")) return;
    if (e.target.closest("#guide")) return;
    if (e.target.closest("#guide-trigger") || e.target.closest("#guide-logo")) return;
    if (e.target.closest(".list-card")) return;
    if (!backdrop.hidden) closeModal();
  });

  document.getElementById("modal-prev").addEventListener("click", function (e) {
    e.stopPropagation();
    stepNav(-1);
  });
  document.getElementById("modal-next").addEventListener("click", function (e) {
    e.stopPropagation();
    stepNav(1);
  });

  // Horizontal swipe across the panel steps through nearby places. The panel
  // scrolls vertically, so only act on a flick that is clearly horizontal —
  // otherwise an ordinary scroll would fire it. Listeners are passive: we
  // never preventDefault, so vertical scrolling stays native and smooth.
  (function () {
    const panel = document.querySelector("#modal-backdrop .modal");
    if (!panel) return;
    let sx = 0, sy = 0, st = 0;
    panel.addEventListener("touchstart", function (e) {
      const t = e.changedTouches[0];
      sx = t.clientX; sy = t.clientY; st = Date.now();
    }, { passive: true });
    panel.addEventListener("touchend", function (e) {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st > 600) return;              // too slow for a flick
      if (Math.abs(dx) < 55) return;                  // too short to be intentional
      if (Math.abs(dx) < Math.abs(dy) * 1.6) return;  // really a vertical scroll
      stepNav(dx < 0 ? 1 : -1);                       // swipe left => next
    }, { passive: true });
  })();

  // Capture phase, so this wins over MapLibre's own arrow-key panning: its
  // handler sits on the map container and would otherwise fire first whenever
  // the canvas still holds focus, panning the map *and* stepping the panel.
  // Only claims the keys while the panel is open — arrow-key panning is
  // untouched the rest of the time.
  document.addEventListener("keydown", function (e) {
    if (backdrop.hidden) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    stepNav(e.key === "ArrowRight" ? 1 : -1);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!backdrop.hidden) closeModal();
    else if (!guideEl.hidden) closeGuide();
    else if (viewMode === "list") showMapView();
  });

  /* ---------- Utils ---------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // schema.org type per category — used only for structured-data markup below.
  const SCHEMA_TYPE = {
    "dog-park": "Park", "park": "Park", "beach": "Beach",
    "trail": "TouristAttraction", "patio": "FoodEstablishment"
  };

  // Generated live from PARKS at load time (not a static hand-maintained
  // blob), so it can never drift out of sync with the dataset.
  function injectStructuredData() {
    const items = PARKS.map(function (p, i) {
      const item = {
        "@type": SCHEMA_TYPE[p.category] || "Place",
        "name": p.name,
        "description": p.description || "",
        "address": { "@type": "PostalAddress", "streetAddress": p.address || "", "addressRegion": "HI", "addressCountry": "US" },
        "geo": { "@type": "GeoCoordinates", "latitude": p.lat, "longitude": p.lng }
      };
      if (p.photo) item.image = p.photo;
      return { "@type": "ListItem", "position": i + 1, "item": item };
    });
    const data = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "name": "Hawaii Dog Map",
          "url": "https://hawaiidogmap.com/",
          "description": "Interactive map of dog-friendly parks, beaches, trails, and patios across Oʻahu, Maui, Kauaʻi, and Hawaiʻi Island."
        },
        {
          "@type": "ItemList",
          "name": "Dog-friendly places on Oʻahu, Maui, Kauaʻi, and Hawaiʻi Island",
          "numberOfItems": items.length,
          "itemListElement": items
        }
      ]
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }
  injectStructuredData();

  /* ---------- Init ---------- */
  fetch("https://tiles.openfreemap.org/styles/positron")
    .then(function (r) { return r.json(); })
    .then(function (style) { buildMap(augmentStyle(style)); })
    .catch(function () { buildMap(rasterFallbackStyle()); });
})();
