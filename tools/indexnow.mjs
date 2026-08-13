#!/usr/bin/env node
/* Push this site's URLs to IndexNow.
 *
 * WHY
 * ---
 * IndexNow tells participating engines (Bing, Yandex, Naver, Seznam — and via
 * Bing's index, DuckDuckGo/Ecosia and several AI answer engines) that URLs have
 * changed, instead of waiting to be crawled. It matters most here because Bing
 * renders JavaScript far less reliably than Google, so the ~300 static pages are
 * exactly the content it can use — and they're all brand new.
 *
 * Google does NOT participate. Google discovery still comes from sitemap.xml,
 * which is already submitted in Search Console. This is additive, not a
 * replacement.
 *
 * AUTH
 * ----
 * There is no account and no API key to keep secret. Ownership is proved by
 * hosting a file at the site root whose NAME is the key and whose CONTENTS are
 * the same key. That file is committed at the repo root and served by Pages.
 * The key is public by design — it authenticates "whoever controls this site",
 * not a person, so there is nothing to leak.
 *
 * ⚠️ The key file must be LIVE before submitting. IndexNow fetches it to
 * validate; if it 404s you get a 403 back and the whole batch is discarded.
 * So: push first, then run this.
 *
 * USAGE
 *   node tools/indexnow.mjs --dry-run   # show what would be sent, send nothing
 *   node tools/indexnow.mjs             # submit every URL in sitemap.xml
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "hawaiidogmap.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const DRY = process.argv.includes("--dry-run");

/* The key file is the single source of truth for the key — deliberately not a
   constant in here as well, so the two can't disagree. */
const keyFile = readdirSync(ROOT).find((f) => /^[a-f0-9]{8,128}\.txt$/.test(f));
if (!keyFile) {
  console.error(
    "No IndexNow key file at the repo root. Create one with:\n" +
      '  KEY=$(node -e \'console.log(require("crypto").randomUUID().replace(/-/g,""))\')\n' +
      '  echo -n "$KEY" > "$KEY.txt"'
  );
  process.exit(1);
}
const key = keyFile.replace(/\.txt$/, "");
const keyContents = readFileSync(join(ROOT, keyFile), "utf8").trim();
if (keyContents !== key) {
  console.error(
    `Key file mismatch: ${keyFile} contains "${keyContents}".\n` +
      "IndexNow requires the file's contents to equal its name (minus .txt)."
  );
  process.exit(1);
}

/* Read the URL list from sitemap.xml rather than rebuilding it from PARKS —
   the sitemap is what the generator already emits, so the two can't drift and
   there's only one place to fix if a URL scheme changes. */
const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (!urlList.length) {
  console.error("sitemap.xml contained no <loc> entries — run tools/build-pages.mjs first.");
  process.exit(1);
}
// IndexNow caps a single request at 10,000 URLs. We're at ~300; this guard is
// here so a future dataset growth fails loudly rather than silently truncating.
if (urlList.length > 10000) {
  console.error(`${urlList.length} URLs exceeds IndexNow's 10,000 per-request limit — batch them.`);
  process.exit(1);
}

const body = {
  host: HOST,
  key,
  keyLocation: `https://${HOST}/${keyFile}`,
  urlList
};

console.log(`IndexNow: ${urlList.length} URLs`);
console.log(`  key file  https://${HOST}/${keyFile}`);
console.log(`  first     ${urlList[0]}`);
console.log(`  last      ${urlList[urlList.length - 1]}`);

if (DRY) {
  console.log("\n--dry-run: nothing submitted.");
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body)
});

const text = await res.text();
console.log(`\nHTTP ${res.status} ${res.statusText}${text ? " — " + text.slice(0, 300) : ""}`);

/* Status meanings are worth spelling out: 200 and 202 both mean success, and
   202 is the common one on a first run — it means "accepted, key still being
   validated", NOT a problem to retry. */
const MEANING = {
  200: "OK — URLs accepted.",
  202: "Accepted; key validation pending. Normal on a first submission.",
  400: "Bad request — malformed JSON or key format.",
  403: "Key not valid. The key file is probably not live yet at the URL above — push, confirm it returns 200, then re-run.",
  422: "URLs don't match the host, or the key doesn't match the host's key file.",
  429: "Rate limited — too many requests. Wait and retry."
};
console.log(MEANING[res.status] || "Unrecognised status; see https://www.indexnow.org/documentation");
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
