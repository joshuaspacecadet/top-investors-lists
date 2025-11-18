import crypto from "crypto";

const SLUG_TO_VIEW = {
  "aerospace-seed": "Aerospace Seed",
  "ai-seed": "AI Seed",
  "bio-seed": "Bio Seed",
  "health-seed": "Health Seed",
  "energy-seed": "Energy Seed",
  "robotics-seed": "Robotics Seed",
  "aerospace-pre-seed": "Aerospace Pre-Seed",
  "ai-pre-seed": "AI Pre-Seed",
  "bio-pre-seed": "Bio Pre-Seed",
  "health-pre-seed": "Health Pre-Seed",
  "energy-pre-seed": "Energy Pre-Seed",
  "robotics-pre-seed": "Robotics Pre-Seed",
  "seed": "Seed",
  "pre-seed": "Pre-Seed",
  // New slugs without "Seed" suffix
  "aerospace": "Aerospace Seed",
  "ai": "AI Seed",
  "bio": "Bio Seed",
  "energy": "Energy Seed",
  "robotics": "Robotics Seed",
};

export const handler = async (event) => {
  try {
    const origin = process.env.SITE_ORIGIN || "https://top-investors-lists.netlify.app";
    const m = event.path.match(/\/resources\/top-investor-lists\/([^\/?#]+)/i);
    const slug = m && m[1] ? decodeURIComponent(m[1]) : "";
    const viewName = SLUG_TO_VIEW[slug] || displayNameFromSlug(slug);
    if (!viewName) return notFound();

    const base = process.env.AIRTABLE_BASE || "";
    const table = process.env.AIRTABLE_TABLE || "";
    if (!base || !table) return error(500, "Missing AIRTABLE_BASE or AIRTABLE_TABLE");

    const url = `${origin}/.netlify/functions/list-records?base=${encodeURIComponent(base)}&table=${encodeURIComponent(table)}&view=${encodeURIComponent(viewName)}`;
    const resp = await fetch(url, { headers: { accept: "application/json", "x-skip-seo": "1" } });
    if (!resp.ok) return error(resp.status, `Upstream error: ${await resp.text()}`);
    const json = await resp.json();
    const count = Array.isArray(json.records) ? json.records.length : 0;

    const displayName = displayNameFromSlug(slug);
    const title = `Top ${count} ${displayName} Investors - Spacecadet`;
    const desc = `Curated list of ${displayName} investors who lead rounds. Export to Google Sheets.`;
    const canonical = `${origin}/resources/top-investor-lists/${slug}`;
    const image = `${origin}/Assets/${encodeURIComponent(viewName)}.png`;

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${image}">
<meta name="robots" content="index,follow">
<style>html,body,.frame{height:100%;margin:0;border:0;padding:0}.frame{width:100%;display:block}</style>
</head>
<body>
<iframe class="frame" src="/index.html?v=${encodeURIComponent(slug)}" title="${escapeHtml(title)}"></iframe>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "ETag": etag(html),
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
        "Netlify-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
      },
      body: html,
    };
  } catch (e) {
    return error(500, e && e.message ? e.message : "Server error");
  }
};

function titleize(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
function displayNameFromSlug(slug) {
  const clean = String(slug || "").trim().toLowerCase();
  const parts = clean.split("-").filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    if (secondLast === "pre" && last === "seed") {
      const head = parts.slice(0, -2).map(cap).join(" ");
      const tail = "Pre-Seed";
      return head ? `${head} ${tail}` : tail;
    }
  }
  return titleize(clean.replace(/-/g, " "));
}
function cap(w) { return w ? w[0].toUpperCase() + w.slice(1) : w; }
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function etag(s) {
  return crypto.createHash("sha1").update(s).digest("hex");
}
function error(code, msg) {
  return { statusCode: code, headers: { "Content-Type": "text/plain" }, body: msg };
}
function notFound() {
  return error(404, "Not found");
}


