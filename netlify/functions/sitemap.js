export const handler = async () => {
  const origin = process.env.SITE_ORIGIN || 'https://top-investors-lists.netlify.app';
  const VIEWS = [
    "Aerospace Seed",
    "AI Seed",
    "Bio Seed",
    "Health Seed",
    "Energy Seed",
    "Robotics Seed",
    "Aerospace Pre-Seed",
    "AI Pre-Seed",
    "Bio Pre-Seed",
    "Health Pre-Seed",
    "Energy Pre-Seed",
    "Robotics Pre-Seed"
  ];
  const slugify = (name) =>
    name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

  const urls = VIEWS.map(v => `${origin}/resources/top-investor-lists/${slugify(v)}`);
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


