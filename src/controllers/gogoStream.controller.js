import {
  extractGogoStream,
  extractGogoServers,
  parseEpisodePage, // ← dagdag na import
} from "../extractors/gogoStream.extractor.js";
import { GOGO_BASE } from "../utils/base_gogo.js";

function normalizeUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${GOGO_BASE}/${url.replace(/^\//, "").replace(/\/$/, "")}/`;
}

// ← existing, huwag baguhin
export const getGogoStreamInfo = async (req, res) => {
  try {
    const { url, server = "fast", type = "sub" } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, message: "Missing param: url" });
    }
    const streamInfo = await extractGogoStream(normalizeUrl(url), server, type);
    if (!streamInfo) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to extract stream" });
    }
    return res.json(streamInfo);
  } catch (e) {
    console.error("[GogoStreamController]", e.message);
    return res.status(500).json({ error: e.message });
  }
};

// ← existing, huwag baguhin
export const getGogoServers = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, message: "Missing param: url" });
    }
    const servers = await extractGogoServers(normalizeUrl(url));
    return res.json(servers);
  } catch (e) {
    console.error("[GogoServersController]", e.message);
    return res.status(500).json({ error: e.message });
  }
};

// ← BAGO: returns embed URL para sa frontend iframe
export const getGogoEmbed = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, message: "Missing param: url" });
    }
    const { iframes } = await parseEpisodePage(normalizeUrl(url));
    if (!iframes || iframes.length === 0) {
      return res
        .status(500)
        .json({ success: false, message: "No embed found" });
    }
    return res.json({
      success: true,
      embedUrl: iframes[0], // pangunahing embed
      allEmbeds: iframes, // lahat, para may fallback ang frontend
    });
  } catch (e) {
    console.error("[GogoEmbedController]", e.message);
    return res.status(500).json({ error: e.message });
  }
};
