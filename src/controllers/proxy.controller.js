import axios from "axios";

export async function proxyStream(req, res) {
  const { url, referer } = req.query;

  if (!url) {
    return res.status(400).send("Missing url");
  }

  let decodedUrl;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    return res.status(400).send("Invalid url");
  }

  let videoHost;
  try {
    videoHost = new URL(decodedUrl).origin;
  } catch {
    return res.status(400).send("Invalid url format");
  }

  const resolvedReferer = referer
    ? decodeURIComponent(referer)
    : "https://megacloud.blog/";

  try {
    const response = await axios.get(decodedUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: resolvedReferer,
        Origin: new URL(resolvedReferer).origin,
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
      },
      timeout: 15000,
    });

    const contentType =
      response.headers["content-type"] || "application/octet-stream";
    const isM3u8 =
      decodedUrl.includes(".m3u8") ||
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegURL");

    if (isM3u8) {
      const text = Buffer.from(response.data).toString("utf-8");

      // If blocked, return 403
      if (
        text.trimStart().startsWith("<!DOCTYPE") ||
        text.trimStart().startsWith("<html")
      ) {
        console.error("[PROXY] Got HTML instead of m3u8 — stream blocked");
        return res.status(403).send("Stream blocked");
      }

      const base = decodedUrl.substring(0, decodedUrl.lastIndexOf("/") + 1);
      const segmentReferer = encodeURIComponent(videoHost + "/");

      const rewritten = text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          // Rewrite URI= inside tags (e.g. #EXT-X-KEY URI="...")
          if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (_, uri) => {
              const absolute = uri.startsWith("http")
                ? uri
                : new URL(uri, base).toString();
              return `URI="/api/proxy?url=${encodeURIComponent(absolute)}&referer=${segmentReferer}"`;
            });
          }

          if (trimmed.startsWith("#")) return line;

          if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return `/api/proxy?url=${encodeURIComponent(trimmed)}&referer=${segmentReferer}`;
          }

          try {
            const absolute = new URL(trimmed, base).toString();
            return `/api/proxy?url=${encodeURIComponent(absolute)}&referer=${segmentReferer}`;
          } catch {
            return line;
          }
        })
        .join("\n");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-cache");
      return res.send(rewritten);
    }

    // Binary — .ts segments, encryption keys, etc.
    const isKey = decodedUrl.includes(".key") || decodedUrl.includes("enc.key");
    const outputContentType = isKey ? "application/octet-stream" : contentType;

    res.setHeader("Content-Type", outputContentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache");
    return res.send(Buffer.from(response.data));
  } catch (err) {
    const status = err?.response?.status || 502;
    console.error(`[PROXY] Failed (${status}): ${decodedUrl}`);
    return res.status(status).send(`Proxy error: ${status}`);
  }
}
