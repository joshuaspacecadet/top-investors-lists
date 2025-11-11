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
  
  const { spreadsheetId, sheetId } = await createEmptySheet({
        googleToken,
        name: `${namePrefix || "Airtable Export"} — ${new Date().toISOString().slice(0,10)}`
      });
  
  await writeValues({ googleToken, spreadsheetId, headers: at.headers, rows: at.rows });
  await formatHeaderRow({ googleToken, spreadsheetId, sheetId, headerCount: at.headers.length });
  
  return json(200, { url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
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
  
    // Desired sheet columns in final order including two custom columns
    const desiredHeaders = [
      "Fund",
      "Intro Path",          // custom column (not in Airtable)
      "Link",
      "Focus",
      "Pitch Advice",
      "Recent Fund",
      "Fund Size",
      "Check Size",
      "Contact Name",
      "Contact LinkedIn",
      "Portfolio Examples",
      "Industries",
      "Stage",
      "Notes"                // custom column (not in Airtable)
    ];
  
    function formatValue(value) {
      if (value == null) return "";
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "object") return JSON.stringify(value);
      return value;
    }
  
    const rows = records.map(record => {
      const f = record.fields || {};
      return desiredHeaders.map(h => {
        // Custom columns are blank by default
        if (h === "Intro Path" || h === "Notes") return "";
        return formatValue(f[h]);
      });
    });
  
    return { headers: desiredHeaders, rows };
  }
  
  async function createEmptySheet({ googleToken, name }) {
    const resp = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties: { title: name } }),
    });
    if (!resp.ok) throw new Error(`Sheets create failed: ${await resp.text()}`);
    const json = await resp.json();
    return {
      spreadsheetId: json.spreadsheetId,
      sheetId: json.sheets && json.sheets[0] && json.sheets[0].properties ? json.sheets[0].properties.sheetId : undefined,
    };
  }
  
  async function writeValues({ googleToken, spreadsheetId, headers, rows }) {
    const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1?valueInputOption=RAW`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [headers, ...rows] }),
    });
    if (!resp.ok) throw new Error(`Sheets write failed: ${await resp.text()}`);
  }
  
  async function formatHeaderRow({ googleToken, spreadsheetId, sheetId, headerCount }) {
    if (!sheetId) return; // safety: if we couldn't detect sheetId, skip formatting
    const resp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: { frozenRowCount: 1 },
              },
              fields: "gridProperties.frozenRowCount",
            },
          },
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headerCount,
              },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                },
              },
              fields: "userEnteredFormat.textFormat.bold",
            },
          },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`Sheets format failed: ${await resp.text()}`);
  }
  