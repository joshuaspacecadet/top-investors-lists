export const handler = async () => {
  const origin = process.env.SITE_ORIGIN || 'https://top-investors-lists.netlify.app';
  const SLUGS = ["seed","pre-seed","aerospace","ai","bio","energy","robotics"];
  const urls = SLUGS.map(s => `${origin}/resources/top-investor-lists/${s}`);
  const lastmod = new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' },
    body: xml
  };
};


