// netlify/functions/new-sheet.js

export const handler = async (event) => {
    try {
      if (event.httpMethod === "OPTIONS") {
        return {
          statusCode: 204,
          headers: corsHeaders(),
        };
      }
  
      if (event.httpMethod !== "POST") {
        return json(405, { error: "Method not allowed" });
      }
  
      const auth = event.headers.authorization || "";
      const googleToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!googleToken) return json(401, { error: "Missing Google access token" });
  
      const { base, table, view, namePrefix } = JSON.parse(event.body || "{}");
      if (!base || !table || !view) return json(400, { error: "Missing base or table or view" });
  
      const at = await fetchAirtable({ base, table, view, token: process.env.AIRTABLE_TOKEN });
  
      const sheetId = await createEmptySheet({
        googleToken,
        name: `${namePrefix || "Airtable Export"} — ${new Date().toISOString().slice(0,10)}`
      });
  
      await writeValues({ googleToken, sheetId, headers: at.headers, rows: at.rows });
  
      return json(200, { url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit` });
    } catch (e) {
      return json(500, { error: e.message || "Server error" });
    }
  };
  
  function corsHeaders() {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    };
  }
  
  function json(status, body) {
    return {
      statusCode: status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(),
      },
      body: JSON.stringify(body),
    };
  }
  
  async function fetchAirtable({ base, table, view, token }) {
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
  
    const fieldSet = new Set();
    records.forEach(r => Object.keys(r.fields || {}).forEach(k => fieldSet.add(k)));
    const headerList = Array.from(fieldSet);
    const rows = records.map(r => headerList.map(h => {
      const v = r.fields?.[h];
      if (v == null) return "";
      if (Array.isArray(v)) return v.join(", ");
      if (typeof v === "object") return JSON.stringify(v);
      return v;
    }));
  
    return { headers: headerList, rows };
  }
  
  async function createEmptySheet({ googleToken, name }) {
    const resp = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.spreadsheet",
      }),
    });
    if (!resp.ok) throw new Error(`Drive create failed: ${await resp.text()}`);
    const file = await resp.json();
    return file.id;
  }
  
  async function writeValues({ googleToken, sheetId, headers, rows }) {
    const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1?valueInputOption=RAW`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [headers, ...rows] }),
    });
    if (!resp.ok) throw new Error(`Sheets write failed: ${await resp.text()}`);
  }
  