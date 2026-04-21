import axios from "axios";
import * as cheerio from "cheerio";
import { GOGO_BASE } from "../utils/base_gogo.js";

const REQ_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: GOGO_BASE,
};

export async function parseEpisodePage(episodeUrl) {
  const fullUrl = episodeUrl.startsWith("http")
    ? episodeUrl
    : `${GOGO_BASE}/${episodeUrl.replace(/^\//, "").replace(/\/$/, "")}/`;

  const { data: html } = await axios.get(fullUrl, {
    headers: REQ_HEADERS,
    timeout: 15000,
  });

  const $ = cheerio.load(html);

  // Get post ID from download link base64
  let postId = null;
  let epNum = "1";

  const downloadHref = $("a[href*='adl=']").first().attr("href");
  if (downloadHref) {
    const b64Match = downloadHref.match(/[?&]adl=([A-Za-z0-9+/=%-]+)/);
    if (b64Match) {
      try {
        const decoded = Buffer.from(
          decodeURIComponent(b64Match[1]),
          "base64",
        ).toString("utf-8");
        const parts = decoded.split("|");
        if (parts.length >= 1 && /^\d+$/.test(parts[0])) {
          postId = parts[0];
          if (parts[1]) epNum = parts[1];
        }
      } catch (_) {}
    }
  }

  if (!postId) {
    const wpMatch =
      html.match(/postid-(\d+)/) || html.match(/"post[_-]id"\s*:\s*(\d+)/i);
    if (wpMatch) postId = wpMatch[1];
  }

  const epMatch = fullUrl.match(/episode-(\d+(?:\.\d+)?)/i);
  if (epMatch) epNum = epMatch[1];

  // Grab ALL iframes from the page directly
  const iframes = [];
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src) iframes.push(src.startsWith("//") ? `https:${src}` : src);
  });

  // Also look for src in noscript or inline scripts
  const srcMatches = html.matchAll(
    /["'](https?:\/\/(?:megavid|megacloud|vidsrc|watching|filemoon|streamwish|dood)[^"']+)["']/g,
  );
  for (const m of srcMatches) {
    if (!iframes.includes(m[1])) iframes.push(m[1]);
  }

  console.log(
    `[GogoExtractor] postId=${postId} epNum=${epNum} iframes=${iframes.length}`,
  );
  if (iframes.length > 0)
    console.log(`[GogoExtractor] First iframe: ${iframes[0].substring(0, 80)}`);

  return { postId, epNum, iframes, pageHtml: html, fullUrl };
}

export async function resolveHlsFromEmbed(embedUrl) {
  if (!embedUrl) return null;
  const url = embedUrl.startsWith("//") ? `https:${embedUrl}` : embedUrl;

  let html;
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": REQ_HEADERS["User-Agent"],
        Accept: "text/html,*/*;q=0.8",
        Referer: GOGO_BASE,
      },
      timeout: 15000,
    });
    html = typeof data === "string" ? data : JSON.stringify(data);
  } catch (err) {
    console.error(
      `[GogoExtractor] Failed to fetch embed ${url.substring(0, 60)}: ${err.message}`,
    );
    return null;
  }

  const patterns = [
    /["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]{0,100})["'`]/,
    /file\s*:\s*["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]{0,100})["'`]/,
    /file\s*:\s*["'`](https?:\/\/[^"'`\s]{20,})["'`]/,
    /"file"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]{0,100})"/,
    /"sources"\s*:\s*\[\s*\{\s*"file"\s*:\s*"([^"]+)"/s,
    /sources\s*:\s*\[.*?"file"\s*:\s*"([^"]+)"/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1] && match[1].startsWith("http")) {
      console.log(`[GogoExtractor] Found HLS: ${match[1].substring(0, 80)}`);
      return match[1];
    }
  }

  console.warn(`[GogoExtractor] No HLS in: ${url.substring(0, 60)}`);
  return null;
}

export async function extractGogoStream(
  episodeUrl,
  server = "fast",
  type = "sub",
) {
  try {
    console.log(
      `[GogoExtractor] ${episodeUrl} | server=${server} type=${type}`,
    );
    const { iframes, postId, epNum } = await parseEpisodePage(episodeUrl);

    // Try each iframe until one returns HLS
    for (const iframe of iframes) {
      const hlsUrl = await resolveHlsFromEmbed(iframe);
      if (hlsUrl) {
        return {
          link: { file: hlsUrl, type: "hls" },
          tracks: [],
          intro: null,
          outro: null,
          iframe,
          server,
          source: "gogoanime",
        };
      }
    }

    console.warn(`[GogoExtractor] All iframes failed for ${episodeUrl}`);
    return null;
  } catch (error) {
    console.error(`[GogoExtractor] Failed: ${error.message}`);
    return null;
  }
}

export async function extractGogoServers(episodeUrl) {
  try {
    const { postId, epNum } = await parseEpisodePage(episodeUrl);
    return ["Fast Server", "HD", "VidSrc", "MegaCloud"].map((name) => ({
      serverName: name,
      type: "sub",
      data_id: `${postId}_${epNum}_${name.toLowerCase().replace(/\s+/g, "")}`,
      server_id: name.toLowerCase().replace(/\s+/g, ""),
    }));
  } catch (err) {
    console.error(`[GogoExtractor] extractGogoServers failed: ${err.message}`);
    return [];
  }
}
