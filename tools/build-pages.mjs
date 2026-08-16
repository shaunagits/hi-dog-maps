#!/usr/bin/env node
/* Static page generator for Hawaiʻi Dog Map.
 *
 * WHY THIS EXISTS
 * ---------------
 * The interactive map is a single URL, and every place name, description and
 * dog rule on it is written into the DOM by JavaScript at runtime. Measured
 * against the live site, that means a crawler fetching hawaiidogmap.com sees
 * ~614 words and ZERO place names, while the sitemap offers exactly one URL.
 * Google does render JS, but on a deferred second pass, and most other
 * crawlers (Bing, AI crawlers, social unfurlers) don't render at all — so 289
 * researched places and every word of the county-ordinance work were
 * effectively invisible.
 *
 * This emits real HTML files, ahead of time, from the same `PARKS` array the
 * map uses. One source of truth: the map and the pages cannot drift.
 *
 * OUTPUT (all committed to the repo root, served by GitHub Pages as-is)
 *   place/<slug>/index.html   one per place (289)
 *   <island>/index.html       four island hubs
 *   <category>/index.html     five category hubs
 *   rules/index.html          the county-by-county rules guide
 *   browse/index.html         the crawl hub linking everything
 *   sitemap.xml               regenerated with every URL
 *
 * RUN
 *   node tools/build-pages.mjs
 *
 * Generated files are overwritten wholesale on every run — never hand-edit a
 * page under place/ or a hub; change the template here, or the data in
 * js/parks-data.js, and re-run.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://hawaiidogmap.com";
const SITE = "Hawaiʻi Dog Map";

/* ---------- Load the dataset ---------- */
// js/parks-data.js is a plain `const PARKS = [...]` browser script, not a
// module. Evaluating it is what keeps this generator reading the exact same
// file the map does, rather than a second exported copy that could drift.
const dataSrc = readFileSync(join(ROOT, "js/parks-data.js"), "utf8");
const PARKS = new Function(dataSrc + "; return PARKS;")();

/* ---------- Vocabulary ---------- */
const ISLANDS = [
  { key: "Oahu", slug: "oahu", name: "Oʻahu" },
  { key: "Maui", slug: "maui", name: "Maui" },
  { key: "Kauai", slug: "kauai", name: "Kauaʻi" },
  { key: "Hawaii Island", slug: "hawaii-island", name: "Hawaiʻi Island" }
];

/* `title` is the noun used in the <title> tag, and it is NOT just `one` with a
   prefix: "Dog-Friendly Dog park in Honolulu" reads as a stutter, and an
   off-leash park's real search term is "off-leash dog park" anyway. */
const CATEGORIES = [
  { key: "dog-park", slug: "dog-parks", one: "Dog park", many: "Dog parks", title: "Off-Leash Dog Park", schema: "Park" },
  { key: "park", slug: "parks", one: "Park", many: "Parks", title: "Dog-Friendly Park", schema: "Park" },
  { key: "beach", slug: "beaches", one: "Beach", many: "Beaches", title: "Dog-Friendly Beach", schema: "Beach" },
  { key: "trail", slug: "trails", one: "Trail", many: "Trails", title: "Dog-Friendly Trail", schema: "Place" },
  { key: "patio", slug: "patios", one: "Patio", many: "Restaurant patios", title: "Dog-Friendly Restaurant Patio", schema: "Restaurant" }
];

const islandBy = Object.fromEntries(ISLANDS.map((i) => [i.key, i]));
const catBy = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

/* Per-island leash regime. This is the single most valuable thing on the site
   that competitors don't have — each county genuinely contradicts the others,
   and these are drawn from the actual ordinances (see CLAUDE.md), not from a
   generic "check local rules" paragraph. */
const ISLAND_RULES = {
  Oahu: {
    summary: "Leashed dogs are allowed only at parks and beaches the City &amp; County of Honolulu has specifically designated — there is no blanket permission.",
    detail: [
      "Honolulu runs a designation list rather than a default rule: a park or beach allows dogs only if it appears on the City &amp; County's list, which expanded to 72 parks in February 2026. Anywhere not on it, dogs are prohibited even on a leash.",
      "Several Oʻahu beaches allow dogs only <strong>below the high-tide line</strong> — makai of the debris line, not on the dry upland sand. Those are flagged on this site rather than presented as straightforwardly open.",
      "Oʻahu also has the state's largest set of fenced off-leash dog parks, which are free and city-run."
    ]
  },
  Maui: {
    summary: "The most permissive regime in the state: leashed dogs are welcome by default in Maui County parks <em>and</em> on county beaches, on a lead of 10 feet or less.",
    detail: [
      "Maui County does not maintain a designation list. Leashed dogs are allowed in county parks and on county beaches generally, with a maximum lead of 10 feet.",
      "Maui also has the state's most developed dog-friendly restaurant-patio scene, and a handful of free county-run off-leash dog parks.",
      "The statewide state-park beach ban still applies here — county beaches are open, state-park beaches are not."
    ]
  },
  Kauai: {
    summary: "The opposite of Maui: Kauaʻi County parks and beaches prohibit dogs entirely except by permit. The places that work are narrow, specific carve-outs.",
    detail: [
      "Because county land is closed to dogs by default, almost everything on this island comes from somewhere else: the Ke Ala Hele Makalae shared-use path is explicitly permitted by county code, and state Forest Reserve and Nā Ala Hele trails run their own policies.",
      "Dog policy on Kauaʻi is <strong>per-trail, not per-landowner</strong>. Two trails in the same Forest Reserve can have opposite rules — Kuilau Ridge allows dogs while Keahua Arboretum a mile away does not, and Waimea Canyon Trail allows them while Awaʻawapuhi Trail in the same state park does not.",
      "Kauaʻi's dog parks sit on Humane Society property and require a day pass or annual-donation membership — they are not free public facilities like Oʻahu's and Maui's."
    ]
  },
  "Hawaii Island": {
    summary: "A hybrid, and the reason you can't generalise from another island: leashed dogs are fine in county parks on a 6-foot lead, but are banned outright from every county <em>beach</em> park, even leashed.",
    detail: [
      "Hawaiʻi County Code <strong>§ 4-4-29</strong> permits leashed dogs in county parks on a maximum 6-foot lead — note that's shorter than Maui's 10 feet. The same code bans dogs from county beach parks entirely, which the County reconfirmed in 2016 regarding Reed's Bay.",
      "Hawaiʻi State Parks separately prohibit pets on beaches, which rules out Hāpuna, Kekaha Kai, MacKenzie and Old Kona Airport. Every beach on this island therefore comes from non-county, non-state-park land.",
      "National Park Service units are the exception and the richest source here — they generally permit leashed dogs on a 6-foot lead on trails and beaches. Puʻukoholā Heiau sits directly beside the excluded Spencer Beach Park, making it the legal alternative next door. (Hawaiʻi Volcanoes NP is the exception to the exception: pets are barred from all trails.)",
      "<strong>There are deliberately no restaurant patios listed on Hawaiʻi Island.</strong> HCC <strong>§ 4-3-5</strong> makes it unlawful to bring a dog to any establishment where food is sold or displayed, restaurants included. The state Department of Health food-code change of 24 August 2025 that legalised dogs in outdoor dining areas is a food-safety rule and does not repeal a county animal-control ordinance. Plenty of businesses do welcome dogs; the county code still says otherwise."
    ]
  }
};

/* ---------- Helpers ---------- */
const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* Back out of HTML into plain text, for meta descriptions and JSON-LD.
   Decoding entities is NOT optional here: the ISLAND_RULES copy and the FAQ
   answers are authored as HTML (they carry <strong>, <em> and "&amp;"), and
   feeding that straight into esc() would double-escape — "City &amp; County"
   became "City &amp;amp; County" and rendered the entity literally in the
   <meta description>. Same for JSON-LD, where entities are not decoded at all
   and would surface verbatim in a rich result. */
const decodeEntities = (s) =>
  String(s)
    .replace(/&(?:nbsp);/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // last: otherwise "&amp;lt;" would unwrap twice

const stripTags = (s) => decodeEntities(String(s).replace(/<[^>]+>/g, ""));

/* URL slug. The ʻokina (U+02BB) and macrons carry meaning in the name but
   can't go in a URL, so names are folded to ASCII: NFD splits the macron off
   its base letter, the combining-mark range removes it, and the ʻokina and
   quote family are dropped outright rather than becoming hyphens (otherwise
   "Puʻuhonua" would slug as "pu-uhonua"). */
function slugify(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ʻʼ‘’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* Truncate to a word boundary for meta descriptions. */
function clamp(s, n = 155) {
  const t = stripTags(String(s)).replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, t.lastIndexOf(" ", n - 1)).replace(/[,;:.]$/, "") + "…";
}

/* Great-circle distance in km, for the "nearby places" internal links. */
function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------- Assign stable slugs ---------- */
/* Assigned in dataset order so a given place keeps its URL as the dataset
   grows. Collisions (there are genuinely repeated park names across islands)
   fall back to name-island, then a numeric suffix. */
const usedSlugs = new Set();
for (const p of PARKS) {
  let s = slugify(p.name);
  if (usedSlugs.has(s)) s = `${s}-${islandBy[p.island]?.slug || slugify(p.island)}`;
  let n = 2;
  const base = s;
  while (usedSlugs.has(s)) s = `${base}-${n++}`;
  usedSlugs.add(s);
  p._slug = s;
  p._url = `/place/${s}/`;
}

/* ---------- Page shell ---------- */
function page({ title, description, canonical, body, jsonld = [], breadcrumb }) {
  const ld = jsonld.filter(Boolean).map(
    (o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`
  ).join("\n  ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${ORIGIN}${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Hawaii Dog Map" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${ORIGIN}${canonical}" />
<meta property="og:image" content="${ORIGIN}/icons/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${ORIGIN}/icons/og-image.png" />
<meta name="theme-color" content="#0e7490" />
<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg?v=2" />
<link rel="icon" href="/favicon.ico?v=2" sizes="any" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=2" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400..900&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/css/pages.css?v=1" />
${ld}
</head>
<body>
<header class="site-head">
  <a class="site-brand" href="/">
    <svg viewBox="1 4.5 62 62" aria-hidden="true" width="26" height="26">
      <path d="M32 6C44.5 6 54 15.2 54 27.5C54 41 40 52.5 32 65C24 52.5 10 41 10 27.5C10 15.2 19.5 6 32 6Z" fill="#0e7490"/>
      <g transform="translate(32 27.5) scale(1.16) translate(-32 -27.5)" fill="#fff">
        <ellipse cx="21.5" cy="28" rx="3.3" ry="4.5"/><ellipse cx="28.5" cy="20.5" rx="3.6" ry="5"/>
        <ellipse cx="35.5" cy="20.5" rx="3.6" ry="5"/><ellipse cx="42.5" cy="28" rx="3.3" ry="4.5"/>
        <path d="M32 29.5C37.5 29.5 42 33 42 37.2C42 41 38.5 42.7 35.2 41.6C33.4 41 30.6 41 28.8 41.6C25.5 42.7 22 41 22 37.2C22 33 26.5 29.5 32 29.5Z"/>
      </g>
    </svg>
    <span>${SITE}</span>
  </a>
  <nav class="site-nav">
    <a href="/browse/">Browse</a>
    <a href="/rules/">Rules &amp; safety</a>
    <a class="site-nav-cta" href="/">Open the map</a>
  </nav>
</header>
${breadcrumb ? `<nav class="crumbs" aria-label="Breadcrumb">${breadcrumb}</nav>` : ""}
<main class="wrap">
${body}
</main>
<footer class="site-foot">
  <nav aria-label="Islands">
    <strong>By island</strong>
    ${ISLANDS.map((i) => `<a href="/${i.slug}/">${i.name}</a>`).join("")}
  </nav>
  <nav aria-label="Types">
    <strong>By type</strong>
    ${CATEGORIES.map((c) => `<a href="/${c.slug}/">${c.many}</a>`).join("")}
  </nav>
  <p class="foot-note">
    Rules, hours and access change without notice — posted signs on site always win over
    anything on this map. <a href="/rules/">Read the rules &amp; safety guide</a>.
  </p>
  <p class="foot-credit"><a class="thread-credit" href="https://threadhawaii.com" target="_blank" rel="noopener" aria-label="Built with love by Thread">Built with <svg class="thread-credit__heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> by Thread</a></p>
</footer>
</body>
</html>
`;
}

function crumbs(trail) {
  return trail
    .map((c, i) =>
      i === trail.length - 1
        ? `<span aria-current="page">${esc(c.name)}</span>`
        : `<a href="${c.url}">${esc(c.name)}</a><span class="crumb-sep" aria-hidden="true">›</span>`
    )
    .join("");
}

function breadcrumbLd(trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: stripTags(c.name),
      item: ORIGIN + c.url
    }))
  };
}

function faqLd(qas) {
  if (!qas.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qas.map((q) => ({
      "@type": "Question",
      name: q.q,
      acceptedAnswer: { "@type": "Answer", text: stripTags(q.a) }
    }))
  };
}

function faqBlock(qas) {
  if (!qas.length) return "";
  return `<section class="faq">
  <h2>Common questions</h2>
  ${qas.map((q) => `<details><summary>${esc(q.q)}</summary><p>${q.a}</p></details>`).join("\n  ")}
</section>`;
}

/* A place's card, used on every hub page. */
function placeCard(p) {
  const c = catBy[p.category];
  return `<li class="card">
  <a href="${p._url}">
    <span class="card-tags">
      <span class="tag tag-${p.type === "off-leash" ? "off" : "on"}">${p.type === "off-leash" ? "Off-leash" : "Leash required"}</span>
      <span class="tag">${esc(c.one)}</span>
      ${p.uncertain ? '<span class="tag tag-warn">Verify first</span>' : ""}
    </span>
    <strong>${esc(p.name)}</strong>
    <span class="card-meta">${esc(p.region || "")}${p.region ? " · " : ""}${esc(islandBy[p.island].name)}</span>
    <span class="card-desc">${esc(clamp(p.description, 120))}</span>
  </a>
</li>`;
}

function cardGrid(list) {
  return `<ul class="grid">\n${list.map(placeCard).join("\n")}\n</ul>`;
}

/* ---------- Place pages ---------- */
function placePage(p) {
  const isle = islandBy[p.island];
  const cat = catBy[p.category];
  const offleash = p.type === "off-leash";
  const trail = [
    { name: "Home", url: "/" },
    { name: isle.name, url: `/${isle.slug}/` },
    { name: p.name, url: p._url }
  ];

  const nearby = PARKS
    .filter((o) => o !== p && o.island === p.island)
    .map((o) => ({ o, d: distanceKm(p, o) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);

  const qas = [
    {
      q: `Are dogs allowed at ${p.name}?`,
      a: `Yes — ${esc(p.name)} is ${offleash
        ? "an off-leash area"
        : "open to leashed dogs"}. ${esc(p.dogRules || "")}`
    },
    p.hours ? { q: `What are the hours at ${p.name}?`, a: esc(p.hours) } : null,
    {
      q: `Where is ${p.name}?`,
      a: `${esc(p.address || p.region)} — ${esc(p.region ? p.region + ", " : "")}${esc(isle.name)}. Coordinates ${p.lat}, ${p.lng}.`
    },
    p.uncertain
      ? {
          q: `Is the dog policy at ${p.name} confirmed?`,
          a: "Not fully. This entry is flagged for verification — the rule is either narrow (for example dogs permitted only below the high-tide line) or the location was placed by geocoder rather than an official GIS layer. Check posted signs when you arrive."
        }
      : null
  ].filter(Boolean);

  const placeLd = {
    "@context": "https://schema.org",
    "@type": cat.schema,
    name: p.name,
    description: stripTags(p.description),
    url: `${ORIGIN}${p._url}`,
    geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
    address: {
      "@type": "PostalAddress",
      streetAddress: p.address || undefined,
      addressLocality: p.region || undefined,
      addressRegion: "HI",
      addressCountry: "US"
    },
    isAccessibleForFree: true,
    ...(p.hours ? { openingHours: p.hours } : {}),
    ...(p.amenities?.length
      ? {
          amenityFeature: p.amenities.map((a) => ({
            "@type": "LocationFeatureSpecification",
            name: a,
            value: true
          }))
        }
      : {}),
    ...(p.photo ? { image: p.photo } : {})
  };

  const body = `
<article class="place">
  <div class="tags">
    <span class="tag tag-${offleash ? "off" : "on"}">${offleash ? "🦮 Off-leash" : "🦮 Leash required"}</span>
    <span class="tag">${esc(cat.one)}</span>
    <span class="tag">${esc(isle.name)}</span>
    ${p.uncertain ? '<span class="tag tag-warn">⚠️ Verify before visiting</span>' : ""}
  </div>

  <h1>${esc(p.name)}</h1>
  <p class="lede">${esc(p.description)}</p>
  ${p.address ? `<p class="addr">📍 ${esc(p.address)}</p>` : ""}

  ${p.photo
      ? `<figure class="hero">
    <img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" width="800" height="450" />
    <figcaption>${esc(p.photoCredit || "")}${p.photoLicense ? ` · ${esc(p.photoLicense)}` : ""}${p.photoSource ? ` · <a href="${esc(p.photoSource)}" target="_blank" rel="noopener">Wikimedia Commons</a>` : ""}</figcaption>
  </figure>`
      : ""}

  <section class="panel panel-dogs">
    <h2>🐶 Dog rules</h2>
    <p>${esc(p.dogRules || "")}</p>
  </section>

  <div class="two-up">
    <section class="panel">
      <h2>🕐 Hours</h2>
      <p>${esc(p.hours || "Not posted")}</p>
    </section>
    <section class="panel">
      <h2>✨ Amenities</h2>
      ${p.amenities?.length
        ? `<ul class="chips">${p.amenities.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
        : "<p>None listed</p>"}
    </section>
  </div>

  <div class="actions">
    <a class="btn btn-primary" href="/?place=${p._slug}">🗺️ Show on the map</a>
    <a class="btn" href="https://www.google.com/maps/dir/?api=1&amp;destination=${p.lat},${p.lng}" target="_blank" rel="noopener">🧭 Get directions</a>
  </div>

  <section class="rules-note">
    <h2>Dog rules on ${esc(isle.name)}</h2>
    <p>${ISLAND_RULES[p.island].summary}</p>
    <p><a href="/${isle.slug}/">See all ${PARKS.filter((x) => x.island === p.island).length} dog-friendly places on ${esc(isle.name)}</a> · <a href="/rules/">Full rules &amp; safety guide</a></p>
  </section>

  ${faqBlock(qas)}

  <section class="nearby">
    <h2>Nearby on ${esc(isle.name)}</h2>
    ${cardGrid(nearby.map((n) => n.o))}
  </section>
</article>`;

  return page({
    title: `${p.name} — ${cat.title} in ${p.region || isle.name}, Hawaiʻi`,
    description: clamp(
      `${p.name}: ${offleash ? "off-leash" : "leashed dogs allowed"}. ${p.description}`
    ),
    canonical: p._url,
    breadcrumb: crumbs(trail),
    jsonld: [placeLd, breadcrumbLd(trail), faqLd(qas)],
    body
  });
}

/* ---------- Island hubs ---------- */
function islandPage(isle) {
  const list = PARKS.filter((p) => p.island === isle.key);
  const rules = ISLAND_RULES[isle.key];
  const trail = [
    { name: "Home", url: "/" },
    { name: isle.name, url: `/${isle.slug}/` }
  ];
  const byCat = CATEGORIES.map((c) => ({ c, items: list.filter((p) => p.category === c.key) })).filter(
    (g) => g.items.length
  );
  const offleash = list.filter((p) => p.type === "off-leash").length;

  const qas = [
    {
      q: `Are dogs allowed on ${isle.name} beaches?`,
      a: rules.summary
    },
    {
      q: `How many dog-friendly places are there on ${isle.name}?`,
      a: `This map lists ${list.length} on ${isle.name}: ${byCat
        .map((g) => `${g.items.length} ${g.c.many.toLowerCase()}`)
        .join(", ")}.`
    },
    {
      q: `Are Hawaiʻi state park beaches open to dogs?`,
      a: "No. State-park beaches are closed to dogs on every island, leashed or not, with service animals excepted. That applies regardless of what the county rule says."
    }
  ];

  const body = `
<h1>Dog-Friendly Places on ${esc(isle.name)}</h1>
<p class="lede">${list.length} verified spots — ${byCat.map((g) => `${g.items.length} ${g.c.many.toLowerCase()}`).join(", ")}${offleash ? `, of which ${offleash} allow off-leash` : ""}.</p>

<section class="panel panel-dogs">
  <h2>The rule on ${esc(isle.name)}</h2>
  <p>${rules.summary}</p>
  ${rules.detail.map((d) => `<p>${d}</p>`).join("\n  ")}
  <p><a href="/rules/">Full rules &amp; safety guide, island by island →</a></p>
</section>

${byCat
      .map(
        (g) => `<section class="hub-group">
  <h2>${esc(g.c.many)} on ${esc(isle.name)} <span class="count">${g.items.length}</span></h2>
  ${cardGrid(g.items)}
</section>`
      )
      .join("\n")}

${faqBlock(qas)}

<section class="rules-note">
  <h2>Other islands</h2>
  <p>${ISLANDS.filter((i) => i.key !== isle.key)
    .map((i) => `<a href="/${i.slug}/">${i.name}</a>`)
    .join(" · ")}</p>
</section>`;

  return page({
    title: `Dog-Friendly Parks, Beaches & Trails on ${isle.name} (${list.length} Verified)`,
    description: clamp(
      `${list.length} dog-friendly places on ${isle.name}: ${byCat
        .map((g) => g.c.many.toLowerCase())
        .join(", ")}. ${stripTags(rules.summary)}`
    ),
    canonical: `/${isle.slug}/`,
    breadcrumb: crumbs(trail),
    jsonld: [
      breadcrumbLd(trail),
      faqLd(qas),
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Dog-friendly places on ${isle.name}`,
        numberOfItems: list.length,
        itemListElement: list.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: ORIGIN + p._url,
          name: p.name
        }))
      }
    ],
    body
  });
}

/* ---------- Category hubs ---------- */
function categoryPage(cat) {
  const list = PARKS.filter((p) => p.category === cat.key);
  const trail = [
    { name: "Home", url: "/" },
    { name: cat.many, url: `/${cat.slug}/` }
  ];
  const byIsle = ISLANDS.map((i) => ({ i, items: list.filter((p) => p.island === i.key) })).filter(
    (g) => g.items.length
  );
  const missing = ISLANDS.filter((i) => !list.some((p) => p.island === i.key));

  const qas = [
    {
      q: `How many dog-friendly ${cat.many.toLowerCase()} are there in Hawaiʻi?`,
      a: `This map lists ${list.length} across ${byIsle.length} island${byIsle.length === 1 ? "" : "s"}: ${byIsle
        .map((g) => `${g.items.length} on ${g.i.name}`)
        .join(", ")}.`
    },
    cat.key === "patio"
      ? {
          q: "Why are there no dog-friendly patios on Hawaiʻi Island?",
          a: "Hawaiʻi County Code § 4-3-5 makes it unlawful to bring a dog to any establishment where food is sold or displayed, restaurants included, with only service and law-enforcement dogs exempt. The state Department of Health food-code change of 24 August 2025 that legalised dogs in outdoor dining areas is a food-safety rule and does not repeal a county animal-control ordinance. Individual businesses may welcome dogs anyway, but the county code still says otherwise."
        }
      : null,
    cat.key === "beach"
      ? {
          q: "Can dogs go on Hawaiʻi state park beaches?",
          a: "No. State-park beaches are closed to dogs on every island, leashed or not, service animals excepted. County beach rules vary enormously — Maui allows leashed dogs, Hawaiʻi Island bans them from county beach parks outright, Kauaʻi requires a permit, and Oʻahu allows them only at designated beaches."
        }
      : null
  ].filter(Boolean);

  const body = `
<h1>Dog-Friendly ${esc(cat.many)} in Hawaiʻi</h1>
<p class="lede">${list.length} verified ${cat.many.toLowerCase()} across ${byIsle.map((g) => g.i.name).join(", ")}.</p>
${missing.length
      ? `<p class="note">Not currently listed on ${missing.map((m) => m.name).join(" or ")}${
          cat.key === "patio" ? " — see the question below for why." : "."
        }</p>`
      : ""}

${byIsle
      .map(
        (g) => `<section class="hub-group">
  <h2>${esc(cat.many)} on ${esc(g.i.name)} <span class="count">${g.items.length}</span></h2>
  <p class="group-note">${ISLAND_RULES[g.i.key].summary}</p>
  ${cardGrid(g.items)}
</section>`
      )
      .join("\n")}

${faqBlock(qas)}`;

  return page({
    title: `Dog-Friendly ${cat.many} in Hawaiʻi — ${list.length} Verified Spots & Map`,
    description: clamp(
      `${list.length} dog-friendly ${cat.many.toLowerCase()} across ${byIsle
        .map((g) => g.i.name)
        .join(", ")}, with the leash rule, hours and amenities for each.`
    ),
    canonical: `/${cat.slug}/`,
    breadcrumb: crumbs(trail),
    jsonld: [
      breadcrumbLd(trail),
      faqLd(qas),
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Dog-friendly ${cat.many.toLowerCase()} in Hawaiʻi`,
        numberOfItems: list.length,
        itemListElement: list.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: ORIGIN + p._url,
          name: p.name
        }))
      }
    ],
    body
  });
}

/* ---------- Rules page ---------- */
function rulesPage() {
  const trail = [
    { name: "Home", url: "/" },
    { name: "Rules & safety", url: "/rules/" }
  ];
  const qas = [
    {
      q: "Can dogs go on beaches in Hawaiʻi?",
      a: "It depends entirely on which island and who owns the beach. State-park beaches are closed to dogs statewide. Among county beaches: Maui allows leashed dogs on a 10-foot lead, Oʻahu allows them only at specifically designated beaches, Kauaʻi requires a permit, and Hawaiʻi Island bans them from county beach parks outright even on a leash."
    },
    {
      q: "What is the leash law in Hawaiʻi?",
      a: "There is no single statewide leash length — each county sets its own. Maui County's maximum is 10 feet; Hawaiʻi County Code § 4-4-29 sets 6 feet; National Park Service land also uses 6 feet. Where dogs are permitted at all, they must be leashed unless you are inside a fenced off-leash dog park."
    },
    {
      q: "Are dogs allowed at Hawaiʻi restaurants?",
      a: "On outdoor patios, often yes — the state Department of Health changed the food code on 24 August 2025 to allow dogs in outdoor dining areas. But that is a food-safety rule and does not override county animal-control ordinances. Hawaiʻi County Code § 4-3-5 still makes it unlawful to bring a dog to any establishment where food is sold, which is why no Hawaiʻi Island patios are listed here."
    },
    {
      q: "Are there off-leash dog parks in Hawaiʻi?",
      a: `Yes — ${PARKS.filter((p) => p.type === "off-leash").length} on this map. Oʻahu and Maui run free county dog parks; Kauaʻi's sit on Humane Society property and require a day pass or annual-donation membership.`
    },
    {
      q: "Do I need to worry about monk seals?",
      a: "Yes. Give Hawaiian monk seals, honu (green sea turtles) and nēnē a wide berth. A dog can seriously injure a seal pup, and a protective mother seal can badly injure your dog. All three are protected species."
    }
  ];

  const body = `
<h1>Dogs in Hawaiʻi: Rules &amp; Safety</h1>
<p class="lede">Every county sets its own rules, and they genuinely contradict each other — what's
fine on Maui can be an offence on Kauaʻi. Here's what carries across the whole state, and what
changes island by island.</p>

<section class="panel panel-warn">
  <h2>⚠️ Before you go</h2>
  <p><strong>Check on arrival.</strong> Rules, hours and access change without notice. Posted signs
  win over anything on this map.</p>
</section>

<section>
  <h2>Two rules apply everywhere in Hawaiʻi</h2>
  <ul class="prose-list">
    <li><strong>State-park beaches are closed to dogs</strong> — leashed or not, on every island.
      Service animals excepted. This quietly rules out many of the best-known beaches, whichever
      island you're on.</li>
    <li><strong>Give monk seals, honu and nēnē a wide berth.</strong> A dog can seriously injure a
      seal pup — and a protective mother seal can badly injure your dog.</li>
  </ul>
</section>

<section>
  <h2>Where dogs stand, island by island</h2>
  <div class="table-wrap">
    <table>
      <thead><tr><th scope="col">Island</th><th scope="col">County parks</th><th scope="col">County beaches</th></tr></thead>
      <tbody>
        <tr><th scope="row"><a href="/oahu/">Oʻahu</a></th><td>Designated parks only</td><td>Designated beaches only</td></tr>
        <tr><th scope="row"><a href="/maui/">Maui</a> · Molokaʻi · Lānaʻi</th><td>Leashed, 10 ft max</td><td>Leashed, 10 ft max</td></tr>
        <tr><th scope="row"><a href="/kauai/">Kauaʻi</a></th><td>Permit only</td><td>Permit only</td></tr>
        <tr><th scope="row"><a href="/hawaii-island/">Hawaiʻi Island</a></th><td>Leashed, 6 ft max</td><td><strong>Not permitted</strong></td></tr>
      </tbody>
    </table>
  </div>
  <p class="note">State parks and National Park Service land run their own rules — state parks are
  stricter (no dogs on beaches), NPS is often more permissive (leashed, six feet). Each entry says
  which applies.</p>
</section>

${ISLANDS.map(
    (i) => `<section class="hub-group" id="${i.slug}">
  <h2>${esc(i.name)}</h2>
  <p><strong>${ISLAND_RULES[i.key].summary}</strong></p>
  ${ISLAND_RULES[i.key].detail.map((d) => `<p>${d}</p>`).join("\n  ")}
  <p><a href="/${i.slug}/">Browse ${PARKS.filter((p) => p.island === i.key).length} dog-friendly places on ${esc(i.name)} →</a></p>
</section>`
  ).join("\n")}

<section>
  <h2>Stay aware</h2>
  <ul class="prose-list">
    <li>Sand, lava rock and pavement get hot enough to burn paws — test it with your hand first.</li>
    <li>Shorebreak and rip currents turn dangerous fast, even on calm-looking days.</li>
    <li>Some trails cross active hunting areas — wear bright colours.</li>
    <li>Carry water for both of you. Shade is scarce, and so is cell signal.</li>
  </ul>
</section>

<section>
  <h2>Why Molokaʻi and Lānaʻi aren't listed</h2>
  <p>Both are Maui County, so the leash rules are the same permissive ones that apply on Maui —
  dogs are not banned there. They're left off for a practical reason: the Molokaʻi passenger ferry
  stopped running in 2016, so the only route is a small aircraft with 48 hours' notice, a required
  kennel, a combined pet-and-owner weight limit, and one pet per flight. There is effectively no
  way for a visitor to bring a dog. Lānaʻi separately has almost nothing to map — 98% of the island
  is privately owned, and its one beach park has been the subject of community efforts to reduce
  visitor numbers.</p>
</section>

${faqBlock(qas)}

<section id="sources">
  <h2>Data &amp; map sources</h2>
  <p>Every place on this map comes from an official designation or a verified published list,
  not a scrape or a guess. Entries with unclear or narrow rules are flagged
  <span class="tag tag-warn">Verify first</span> rather than presented as certain.</p>
  <ul class="prose-list">
    <li><a href="https://www.honolulu.gov/dpr/dog-parks/" target="_blank" rel="noopener">City &amp; County of Honolulu, Dept. of Parks &amp; Recreation</a> — Oʻahu on-leash park designations &amp; GIS park data</li>
    <li><a href="https://www.hawaiianhumane.org/dog-friendly-parks/" target="_blank" rel="noopener">Hawaiian Humane Society</a> — Oʻahu dog-friendly beach &amp; park lists</li>
    <li><a href="https://www.mauicounty.gov/119/Parks-Recreation" target="_blank" rel="noopener">Maui County Parks &amp; Recreation</a> — Maui's official off-leash dog parks</li>
    <li><a href="https://www.mauihumanesociety.org/beach-buddies-resource-page/" target="_blank" rel="noopener">Maui Humane Society</a> — Maui dog-friendly beach, park &amp; patio recommendations</li>
    <li><a href="https://dlnr.hawaii.gov/recreation/nah/" target="_blank" rel="noopener">Hawaiʻi Division of Forestry &amp; Wildlife (Nā Ala Hele)</a> &amp; <a href="https://dlnr.hawaii.gov/dsp/" target="_blank" rel="noopener">Division of State Parks</a> — trail &amp; state park dog policies</li>
    <li><a href="https://www.hawaiicounty.gov/departments/parks-and-recreation" target="_blank" rel="noopener">Hawaiʻi County Parks &amp; Recreation</a> &amp; <a href="https://geoportal.hawaii.gov/" target="_blank" rel="noopener">Hawaiʻi Statewide GIS</a> — Hawaiʻi Island park data &amp; the county leash ordinance</li>
    <li><a href="https://hihs.org/" target="_blank" rel="noopener">Hawaiʻi Island Humane Society</a> — the island's two public off-leash Bark Parks</li>
    <li><a href="https://www.nps.gov/puhe/" target="_blank" rel="noopener">National Park Service</a> — Puʻukoholā Heiau pet rules</li>
    <li><a href="https://www.kauai.gov/Government/Departments-Agencies/Parks-Recreation" target="_blank" rel="noopener">Kauaʻi County</a> &amp; <a href="https://kauaihumane.org/" target="_blank" rel="noopener">Kauaʻi Humane Society</a> — Kauaʻi park ordinances &amp; dog park info</li>
    <li><a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> &amp; <a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre GL JS</a> — map tiles &amp; rendering</li>
    <li><a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> — satellite imagery, hillshade &amp; bathymetry</li>
    <li><a href="https://commons.wikimedia.org/" target="_blank" rel="noopener">Wikimedia Commons</a> — place photos (public domain &amp; Creative Commons licensed)</li>
  </ul>
</section>`;

  return page({
    title: "Dogs in Hawaiʻi: Leash Laws, Beach Rules & Safety by Island",
    description:
      "Hawaiʻi's dog rules differ by county and genuinely contradict each other. Leash lengths, which beaches allow dogs, the statewide state-park ban, and the ordinances behind them.",
    canonical: "/rules/",
    breadcrumb: crumbs(trail),
    jsonld: [breadcrumbLd(trail), faqLd(qas)],
    body
  });
}

/* ---------- Browse hub ---------- */
/* The crawl path. Every place page is reachable from an island hub, and every
   hub from here — so nothing depends on the sitemap alone to be discovered. */
function browsePage() {
  const trail = [
    { name: "Home", url: "/" },
    { name: "Browse", url: "/browse/" }
  ];
  const body = `
<h1>Browse Every Dog-Friendly Place in Hawaiʻi</h1>
<p class="lede">All ${PARKS.length} places on the map, by island and by type.</p>

<section class="hub-group">
  <h2>By island</h2>
  <ul class="grid grid-hub">
    ${ISLANDS.map((i) => {
      const n = PARKS.filter((p) => p.island === i.key).length;
      return `<li class="card"><a href="/${i.slug}/"><strong>${esc(i.name)}</strong><span class="card-meta">${n} places</span><span class="card-desc">${esc(clamp(stripTags(ISLAND_RULES[i.key].summary), 110))}</span></a></li>`;
    }).join("\n    ")}
  </ul>
</section>

<section class="hub-group">
  <h2>By type</h2>
  <ul class="grid grid-hub">
    ${CATEGORIES.map((c) => {
      const n = PARKS.filter((p) => p.category === c.key).length;
      return `<li class="card"><a href="/${c.slug}/"><strong>${esc(c.many)}</strong><span class="card-meta">${n} places</span></a></li>`;
    }).join("\n    ")}
  </ul>
</section>

${ISLANDS.map((i) => {
    const list = PARKS.filter((p) => p.island === i.key);
    return `<section class="hub-group">
  <h2>Every place on ${esc(i.name)} <span class="count">${list.length}</span></h2>
  <ul class="link-list">
    ${list.map((p) => `<li><a href="${p._url}">${esc(p.name)}</a> <span class="dim">${esc(p.region || "")}</span></li>`).join("\n    ")}
  </ul>
</section>`;
  }).join("\n")}`;

  return page({
    title: `Browse All ${PARKS.length} Dog-Friendly Places in Hawaiʻi`,
    description: `Every dog-friendly park, beach, trail and restaurant patio on the Hawaiʻi Dog Map — ${PARKS.length} verified places across Oʻahu, Maui, Kauaʻi and Hawaiʻi Island.`,
    canonical: "/browse/",
    breadcrumb: crumbs(trail),
    jsonld: [breadcrumbLd(trail)],
    body
  });
}

/* ---------- Write ---------- */
function write(rel, html) {
  const full = join(ROOT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html, "utf8");
}

// Generated directories are rebuilt from scratch, so a renamed or removed
// place can't leave a stale page behind that the sitemap no longer lists.
for (const dir of ["place", "browse", "rules", ...ISLANDS.map((i) => i.slug), ...CATEGORIES.map((c) => c.slug)]) {
  const full = join(ROOT, dir);
  if (existsSync(full)) rmSync(full, { recursive: true, force: true });
}

const urls = [];
const today = new Date().toISOString().slice(0, 10);

for (const p of PARKS) {
  write(`place/${p._slug}/index.html`, placePage(p));
  urls.push({ loc: p._url, pri: "0.7" });
}
for (const isle of ISLANDS) {
  write(`${isle.slug}/index.html`, islandPage(isle));
  urls.push({ loc: `/${isle.slug}/`, pri: "0.9" });
}
for (const cat of CATEGORIES) {
  write(`${cat.slug}/index.html`, categoryPage(cat));
  urls.push({ loc: `/${cat.slug}/`, pri: "0.9" });
}
write("rules/index.html", rulesPage());
urls.push({ loc: "/rules/", pri: "0.9" });
write("browse/index.html", browsePage());
urls.push({ loc: "/browse/", pri: "0.6" });

/* Sitemap — regenerated so it can never drift from what actually exists. */
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ORIGIN}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
${urls
  .map(
    (u) =>
      `  <url><loc>${ORIGIN}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${u.pri}</priority></url>`
  )
  .join("\n")}
</urlset>
`;
writeFileSync(join(ROOT, "sitemap.xml"), sitemap, "utf8");

console.log(`Generated ${PARKS.length} place pages, ${ISLANDS.length} island hubs, ${CATEGORIES.length} category hubs, rules + browse.`);
console.log(`sitemap.xml: ${urls.length + 1} URLs, lastmod ${today}`);
