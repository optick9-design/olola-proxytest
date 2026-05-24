export default async function handler(req, res) {

  // CORS 허용
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { mallid, path, ...params } = req.query;

    if (!mallid || !path) {
      return res.status(400).json({ error: "mallid와 path가 필요합니다." });
    }

    const query = new URLSearchParams(params).toString();
    const url = `https://${mallid}.cafe24api.com/api/v2/${path}${query ? "?" + query : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: req.headers.authorization || "",
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
