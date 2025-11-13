// netlify/functions/list-records.js
import crypto from "crypto";

export const handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders() };
    }
    if (event.httpMethod !== "GET") {
      return json(405, { error: "Method not allowed" });
    }

    const params = event.queryStringParameters || {};
    const base = params.base;
    const table = params.table;
    const view = params.view;
    if (!base || !table || !view) {
      return json(400, { error: "Missing base or table or view" });
    }

    const records = await fetchAirtableFull({
      base,
      table,
      view,
      token: process.env.AIRTABLE_TOKEN,
    });

    const shaped = records.map((r) => {
      const fields = r.fields || {};
      const image = Array.isArray(fields["Image"]) && fields["Image"][0] ? fields["Image"][0] : null;
      return {
        contactName: fields["Contact Name"] || "",
        fund: fields["Fund"] || "",
        link: fields["Link"] || "",
        checkSize: fields["Check Size"] || "",
        focus: fields["Focus"] || "",
        pitchAdvice: fields["Pitch Advice"] || "",
        imageUrl: image && (image.url || image.thumbnails?.large?.url || image.thumbnails?.small?.url) || "",
      };
    });

    // ETag + CDN/browser caching
    const body = JSON.stringify({ records: shaped });
    const etag = crypto.createHash("sha1").update(body).digest("hex");
    const ifNoneMatch = (event.headers["if-none-match"] || event.headers["If-None-Match"] || "").replace(/W\//, "");

    const commonHeaders = {
      ...corsHeaders(),
      "Content-Type": "application/json",
      "ETag": etag,
      "Cache-Control": "public, max-age=60, stale-while-revalidate=86400",
      "Netlify-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400"
    };

    if (ifNoneMatch && ifNoneMatch === etag) {
      return { statusCode: 304, headers: commonHeaders };
    }

    return { statusCode: 200, headers: commonHeaders, body };
  } catch (e) {
    return json(500, { error: e.message || "Server error" });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=86400",
      ...corsHeaders()
    },
    body: JSON.stringify(body),
  };
}

async function fetchAirtableFull({ base, table, view, token }) {
  const firstUrl = `https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}?view=${encodeURIComponent(view)}&pageSize=100`;
  const headers = { Authorization: `Bearer ${token}` };
  const records = [];
  let url = firstUrl;

  while (url) {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
    const j = await r.json();
    records.push(...(j.records || []));
    url = j.offset ? `${firstUrl}&offset=${encodeURIComponent(j.offset)}` : null;
  }

  return records;
}


