import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  async function fetchWithRetryAndTimeout(
    url: string,
    options: RequestInit = {},
    retries = 2,
    timeoutMs = 30000
  ): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(id);
        return response;
      } catch (err: any) {
        clearTimeout(id);
        const isTimeout = err.name === 'AbortError';
        
        if (attempt === retries) {
          if (isTimeout) {
            throw new Error(`Timeout ${timeoutMs}ms saat menghubungi server pusat. Silakan coba lagi.`);
          }
          throw err;
        }
        console.warn(`Percobaan proxy ke-${attempt} gagal. Mencoba kembali... (${err.message})`);
        await new Promise(resolve => setTimeout(resolve, attempt * 800));
      }
    }
    throw new Error("Gagal menghubungi server tujuan.");
  }

  app.post("/api/proxy", async (req, res) => {
    try {
      const { endpoint, payload } = req.body;
      const url = `http://103.109.206.102:8089/Ponorogo-absensApi/index.php${endpoint}`;
      
      const params = new URLSearchParams();
      if (payload) {
        for (const key in payload) {
          if (payload[key] !== undefined && payload[key] !== null) {
            params.append(key, payload[key]);
          }
        }
      }

      const response = await fetchWithRetryAndTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Dart/3.0 (dart:io)",
          "Accept": "application/json",
          "Authorization": "Bearer null"
        },
        body: params.toString(),
      });

      const data = await response.text();
      try {
        const jsonData = JSON.parse(data);
        res.json(jsonData);
      } catch (e) {
        res.status(500).json({ error: "Gagal memproses JSON dari server pusat", text: data });
      }
    } catch (err: any) {
      console.error("Proxy error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/proxy-image", async (req, res) => {
    try {
      const { path } = req.query;
      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: "Path is required" });
      }
      
      const imageUrl = `http://103.109.206.102:8087${path.startsWith('/') ? path : '/' + path}`;
      
      const response = await fetchWithRetryAndTimeout(imageUrl, {
        method: "GET",
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: "Gagal memuat gambar" });
      }

      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      // Tambahkan Cache-Control untuk menghemat kuota data dan mempercepat loading
      res.setHeader("Cache-Control", "public, max-age=86400"); // Cache 24 jam
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    } catch (err: any) {
      console.error("Proxy image error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
