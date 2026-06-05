export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { store, client_id, client_secret } = req.body || {};

  if (!store || !client_id || !client_secret) {
    return res.status(400).json({ error: "store, client_id, client_secret 모두 필요합니다." });
  }

  try {
    const r = await fetch(`https://${store}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id,
        client_secret,
        grant_type: "client_credentials",
      }).toString(),
    });

    const data = await r.json();

    if (data.access_token) {
      return res.status(200).json({
        access_token: data.access_token,
        expires_in: data.expires_in || null,
        scope: data.scope || null,
      });
    } else {
      return res.status(400).json({ error: data.errors || "토큰 발행 실패" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
