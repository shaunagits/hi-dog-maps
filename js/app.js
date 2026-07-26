/* HI Dog Maps — native MapLibre GL implementation */
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
  // Swap here once Nunito glyph tiles are hosted; see --font-map-label in CSS.
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
    const hay = (p.name + " " + (p.region || "") + " " + (p.address || "") + " " +
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
      center: [-157.95, 21.45],
      zoom: 9.4,
      pitch: 20,
      bearing: 0,
      maxPitch: 72,
      attributionControl: false,
      dragRotate: true
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    // Zoom control top-right (below the basemap toggle) so the bottom stays free for filters.
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
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

    // Location points (clustered)
    map.addSource("points", {
      type: "geojson",
      data: currentFeatures(),
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 13
    });
    // Invisible hit layer so the clustered source loads + is queryable.
    map.addLayer({ id: "points-hit", type: "circle", source: "points",
      paint: { "circle-radius": 0, "circle-opacity": 0 } });

    map.on("render", syncMarkers);
    map.on("idle", syncMarkers);
    map.on("moveend", syncMarkers);
    refresh();
    fitAll(false);
    syncMarkers();
  }

  /* ---------- HTML marker sync (clusters + pins) ---------- */
  const markers = {};
  let markersOnScreen = {};

  // (Re)populate a cluster bubble element. Cluster ids are reused across zooms,
  // so a reused marker must have its position, count, and click target refreshed.
  function renderClusterEl(el, props, coords) {
    const n = props.point_count;
    const size = n < 10 ? 36 : n < 25 ? 42 : 48;
    el.className = "cluster-bubble";
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.textContent = n;
    el.onclick = function () {
      const src = map.getSource("points");
      Promise.resolve(src.getClusterExpansionZoom(props.cluster_id)).then(function (zoom) {
        map.easeTo({ center: coords, zoom: (zoom || map.getZoom()) + 0.2, pitch: map.getPitch(), duration: 600 });
      }).catch(function () {});
    };
  }

  function clusterEl(props, coords) {
    const el = document.createElement("div");
    renderClusterEl(el, props, coords);
    return el;
  }

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

  function syncMarkers() {
    if (!map.isSourceLoaded("points")) return;
    const newMarkers = {};
    const features = map.querySourceFeatures("points");
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const props = f.properties;
      if (props.cluster) {
        // Clusters: their centroid + count change as you zoom (cluster ids get
        // recycled), so update position and content whenever a bubble is reused.
        const id = "c" + props.cluster_id;
        const coords = f.geometry.coordinates;
        let marker = markers[id];
        if (!marker) {
          marker = markers[id] = new maplibregl.Marker({ element: clusterEl(props, coords), anchor: "center" }).setLngLat(coords);
        } else {
          marker.setLngLat(coords);
          renderClusterEl(marker.getElement(), props, coords);
        }
        newMarkers[id] = marker;
        if (!markersOnScreen[id]) marker.addTo(map);
      } else {
        // Individual pins never move — anchor once to the EXACT data coordinate.
        // (querySourceFeatures geometry is tile-quantized and jitters frame to frame.)
        const id = "p" + props.idx;
        let marker = markers[id];
        if (!marker) {
          const park = PARKS[props.idx];
          marker = markers[id] = new maplibregl.Marker({ element: pinEl(props), anchor: "bottom" })
            .setLngLat([park.lng, park.lat]);
        }
        newMarkers[id] = marker;
        if (!markersOnScreen[id]) marker.addTo(map);
      }
    }
    for (const id in markersOnScreen) {
      if (!newMarkers[id]) markersOnScreen[id].remove();
    }
    markersOnScreen = newMarkers;
  }

  function fitAll(animate) {
    const fc = currentFeatures();
    if (!map || !fc.features.length) return;
    const b = new maplibregl.LngLatBounds();
    fc.features.forEach(function (f) { b.extend(f.geometry.coordinates); });
    const cam = map.cameraForBounds(b, { padding: { top: 130, bottom: 90, left: 90, right: 90 }, maxZoom: 12.5 });
    if (!cam) return;
    const target = { center: cam.center, zoom: cam.zoom, pitch: 20, bearing: 0 };
    if (animate) map.easeTo(Object.assign({ duration: 800 }, target));
    else map.jumpTo(target);
  }

  function refresh() {
    const fc = currentFeatures();
    if (countEl) countEl.textContent = fc.features.length;
    if (map && map.getSource("points")) map.getSource("points").setData(fc);
    renderSearchResults();
  }

  function focusPark(park) {
    if (!map) return;
    map.flyTo({ center: [park.lng, park.lat], zoom: 15, pitch: 20, bearing: 0, essential: true, duration: 900 });
    openModal(park);
  }

  /* ---------- Basemap toggle ---------- */
  function setBasemap(name) {
    if (!map || !map.getLayer("satellite")) return;
    map.setLayoutProperty("satellite", "visibility", name === "satellite" ? "visible" : "none");
  }

  document.querySelectorAll("[data-base]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-base]").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      setBasemap(btn.getAttribute("data-base"));
    });
  });

  /* ---------- Filters ---------- */
  document.querySelectorAll("[data-filter-type]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-filter-type]").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      state.filterType = btn.getAttribute("data-filter-type");
      refresh();
      fitAll(true);
    });
  });

  document.querySelectorAll("[data-filter-cat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-filter-cat]").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      state.filterCat = btn.getAttribute("data-filter-cat");
      refresh();
      fitAll(true);
    });
  });

  /* ---------- Search ---------- */
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  const searchResults = document.getElementById("search-results");

  function renderSearchResults() {
    if (!state.query) {
      searchResults.hidden = true;
      searchResults.innerHTML = "";
      return;
    }
    const parks = visibleParks();
    searchResults.innerHTML = "";
    if (parks.length === 0) {
      const li = document.createElement("li");
      li.className = "search-empty";
      li.textContent = "No matches — try a different name or region.";
      searchResults.appendChild(li);
      searchResults.hidden = false;
      return;
    }
    parks.forEach(function (park) {
      const li = document.createElement("li");
      li.className = "search-result";
      li.innerHTML =
        '<span class="dot ' + (park.type === "off-leash" ? "dot-offleash" : "dot-leashed") + '"></span>' +
        '<span class="search-result-text">' +
          '<span class="search-result-name">' + escapeHtml(park.name) + "</span>" +
          '<span class="search-result-meta">' + escapeHtml((CATEGORY_LABEL[park.category] || "") + " · " + (park.region || "")) + "</span>" +
        "</span>";
      li.addEventListener("click", function () {
        focusPark(park);
        searchResults.hidden = true;
      });
      searchResults.appendChild(li);
    });
    searchResults.hidden = false;
  }

  function clearSearch() {
    searchInput.value = "";
    state.query = "";
    searchClear.hidden = true;
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    refresh();
    fitAll(true);
  }

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value.trim().toLowerCase();
    searchClear.hidden = state.query.length === 0;
    refresh();
  });

  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      const parks = visibleParks();
      if (parks.length > 0) { focusPark(parks[0]); searchResults.hidden = true; searchInput.blur(); }
    } else if (e.key === "Escape") {
      if (state.query) { e.stopPropagation(); clearSearch(); }
    }
  });

  searchInput.addEventListener("focus", function () { if (state.query) renderSearchResults(); });
  searchClear.addEventListener("click", function () { clearSearch(); searchInput.focus(); });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".search-panel")) searchResults.hidden = true;
  });

  /* ---------- Modal ---------- */
  const backdrop = document.getElementById("modal-backdrop");

  function openModal(park) {
    const hero = document.getElementById("modal-hero");
    hero.className = "modal-hero hero-" + park.category;
    if (park.photo) {
      hero.style.backgroundImage = "url('" + park.photo + "')";
      hero.innerHTML = "";
    } else {
      hero.style.backgroundImage = "";
      hero.innerHTML = catIcon(park.category, 66);
    }

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
      "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(park.name + ", " + (park.address || "Oahu, HI"));

    backdrop.hidden = false;
  }

  function closeModal() { backdrop.hidden = true; }

  document.getElementById("modal-close").addEventListener("click", closeModal);
  backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeModal(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !backdrop.hidden) closeModal();
  });

  /* ---------- Utils ---------- */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- Init ---------- */
  fetch("https://tiles.openfreemap.org/styles/positron")
    .then(function (r) { return r.json(); })
    .then(function (style) { buildMap(augmentStyle(style)); })
    .catch(function () { buildMap(rasterFallbackStyle()); });
})();
