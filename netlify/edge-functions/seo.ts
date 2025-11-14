// Netlify Edge Function: Inject per-view SEO based on slug in URL
// Runs at the edge so crawlers receive the correct static meta immediately.
// Docs: https://docs.netlify.com/edge-functions/overview/
export default async (request: Request, context: any) => {
  try {
    // Skip SEO processing for internal API fetches
    if (request.headers.get("x-skip-seo") === "1") {
      return context.next();
    }
    const { pathname, origin } = new URL(request.url);
    const slugMatch = pathname.match(/\/resources\/top-investor-lists\/([^\/?#]+)/i);
    const slug = slugMatch && slugMatch[1] ? decodeURIComponent(slugMatch[1]) : "";

    const viewName = deriveViewName(slug);
    const canonicalUrl = `${origin}${buildCanonicalPath(pathname, slug)}`;
    // Fetch count from API for SSR meta if possible
    let count: number | undefined = undefined;
    if (viewName) {
      const base = (globalThis as any).Deno?.env?.get("AIRTABLE_BASE") || "";
      const table = (globalThis as any).Deno?.env?.get("AIRTABLE_TABLE") || "";
      if (base && table) {
        const listUrl = `${origin}/.netlify/functions/list-records?base=${encodeURIComponent(base)}&table=${encodeURIComponent(table)}&view=${encodeURIComponent(viewName)}`;
        const ac = new AbortController();
        const timeoutId = setTimeout(() => ac.abort(), 8000);
        try {
          const resp = await fetch(listUrl, {
            signal: ac.signal,
            headers: { accept: "application/json", "x-skip-seo": "1" }
          });
          if (resp.ok) {
            const j = await resp.json();
            if (j && Array.isArray(j.records)) count = j.records.length;
          }
        } catch (_e) {
          // ignore and fall back
        } finally {
          clearTimeout(timeoutId);
        }
      }
    }
    const titleBase = viewName ? (count != null ? `Top ${count} ${viewName} Investors` : `Top ${viewName} Investors`) : "Top Investors";
    const title = `${titleBase} - Spacecadet`;
    const description = viewName
      ? `Curated list of ${viewName} investors who lead rounds. Export to Google Sheets.`
      : `Curated lists of top investors by category. Export to Google Sheets.`;
    const image = `${origin}/Assets/handshake.jpg`;

    const response = await context.next();

    // Only process HTML responses
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html/i.test(contentType)) {
      return response;
    }

    let hasMetaDescription = false;
    const rewriter = new HTMLRewriter()
      // Title
      .on("title", {
        element(el) {
          try {
            el.setInnerContent(title);
          } catch {}
        },
      })
      // Normalize/overwrite existing OpenGraph/Twitter/canonical tags if present
      .on('meta[property="og:type"]', { element(el) { try { el.setAttribute("content", "website"); } catch {} } })
      .on('meta[property="og:title"]', { element(el) { try { el.setAttribute("content", title); } catch {} } })
      .on('meta[property="og:description"]', { element(el) { try { el.setAttribute("content", description); } catch {} } })
      .on('meta[property="og:url"]', { element(el) { try { el.setAttribute("content", canonicalUrl); } catch {} } })
      .on('meta[property="og:image"]', { element(el) { try { el.setAttribute("content", image); } catch {} } })
      .on('meta[name="twitter:card"]', { element(el) { try { el.setAttribute("content", "summary_large_image"); } catch {} } })
      .on('meta[name="twitter:title"]', { element(el) { try { el.setAttribute("content", title); } catch {} } })
      .on('meta[name="twitter:description"]', { element(el) { try { el.setAttribute("content", description); } catch {} } })
      .on('meta[name="twitter:image"]', { element(el) { try { el.setAttribute("content", image); } catch {} } })
      .on('link[rel="canonical"]', { element(el) { try { el.setAttribute("href", canonicalUrl); } catch {} } })
      // Hero headline and copy (server-side update to avoid default flash)
    .on("h1.hero-headline", {
        element(el) {
          try {
            if (viewName) {
              el.setInnerContent(count != null ? `Top ${count} ${viewName} Investors` : `Top ${viewName} Investors`);
            }
          } catch {}
        },
      })
      .on("p.hero-copy", {
        element(el) {
          try {
            if (viewName) {
              el.setInnerContent(
                `Identifying appropriate investors is hard. Here's a curated list of ${viewName} investors (in alphabetical order) who actually lead rounds.`
              );
            }
          } catch {}
        },
      })
      // Meta description (replace if exists)
      .on('meta[name="description"]', {
        element(el) {
          try {
            hasMetaDescription = true;
            el.setAttribute("content", description);
          } catch {}
        },
      })
      // If no meta description, append one to head
      .on("head", {
        element(el) {
          try {
            if (!hasMetaDescription) {
              el.append(`<meta name="description" content="${escapeHtml(description)}">`, { html: true });
            }
            el.append(`<link rel="canonical" href="${canonicalUrl}">`, { html: true });
            // Open Graph
            el.append(`<meta property="og:type" content="website">`, { html: true });
            el.append(`<meta property="og:title" content="${escapeHtml(title)}">`, { html: true });
            el.append(`<meta property="og:description" content="${escapeHtml(description)}">`, { html: true });
            el.append(`<meta property="og:url" content="${canonicalUrl}">`, { html: true });
            el.append(`<meta property="og:image" content="${image}">`, { html: true });
            // Twitter
            el.append(`<meta name="twitter:card" content="summary_large_image">`, { html: true });
            el.append(`<meta name="twitter:title" content="${escapeHtml(title)}">`, { html: true });
            el.append(`<meta name="twitter:description" content="${escapeHtml(description)}">`, { html: true });
            el.append(`<meta name="twitter:image" content="${image}">`, { html: true });
            // JSON-LD
            el.append(
              `<script type="application/ld+json" id="ld-collection">${JSON.stringify({
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                name: title,
                description,
                url: canonicalUrl,
                isPartOf: { "@type": "WebSite", name: "Spacecadet", url: origin },
              })}</script>`,
              { html: true }
            );
          } catch {}
        },
      });

    return rewriter.transform(response);
  } catch {
    // Fail open: return origin HTML if anything throws
    return context.next();
  }
};

function deriveViewName(slug: string): string {
  const clean = String(slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  if (!clean) return "";
  const tokens = clean.split("-").filter(Boolean);
  const upperShort = tokens.map((t) => (t.length <= 2 ? t.toUpperCase() : t));
  // Prefer mixed format: head spaced + last-two hyphen
  if (upperShort.length >= 3) {
    const head = upperShort.slice(0, -2).join(" ");
    const tail = upperShort.slice(-2).join("-");
    return titleCase(`${head ? head + " " : ""}${tail}`);
  }
  // Fallbacks
  return titleCase(upperShort.join(" "));
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildCanonicalPath(pathname: string, slug: string): string {
  const baseMatch = pathname.match(/^(.*\/resources\/top-investor-lists)\/?/i);
  const base = baseMatch ? baseMatch[1] : "/resources/top-investor-lists";
  const safeSlug = String(slug || "").replace(/^\//, "");
  return `${base}/${safeSlug}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


