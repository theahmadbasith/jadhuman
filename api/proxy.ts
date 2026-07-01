export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { endpoint, payload } = req.body;
    const url = `http://103.109.206.102:8089/Ponorogo-absensApi/index.php${endpoint || ""}`;
    
    const params = new URLSearchParams();
    if (payload) {
      for (const key in payload) {
        if (payload[key] !== undefined && payload[key] !== null) {
          params.append(key, payload[key]);
        }
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await response.text();
    try {
      const jsonData = JSON.parse(data);
      res.status(200).json(jsonData);
    } catch (e) {
      res.status(500).json({ error: "Failed to parse JSON response from target", text: data });
    }
  } catch (err: any) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: err.message });
  }
}
