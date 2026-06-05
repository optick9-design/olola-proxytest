export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Shopify-Store, X-Shopify-Token");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const store = req.headers["x-shopify-store"] || process.env.SHOPIFY_STORE;
  const token = req.headers["x-shopify-token"] || process.env.SHOPIFY_TOKEN;

  if (!store || !token) {
    return res.status(400).json({ error: "Missing store or token" });
  }

  const { endpoint = "orders", ...params } = req.query;

  const ALLOWED = ["orders", "products", "customers", "shop"];
  if (!ALLOWED.includes(endpoint)) {
    return res.status(400).json({ error: "Endpoint not allowed" });
  }

  const qs = new URLSearchParams(params).toString();
  const url = `https://${store}/admin/api/2026-01/${endpoint}.json${qs ? "?" + qs : ""}`;

  try {
    const r = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ errors: err });
    }

    const data = await r.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
