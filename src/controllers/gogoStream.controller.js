import {
  extractGogoStream,
  extractGogoServers,
} from "../extractors/gogoStream.extractor.js";
import { GOGO_BASE } from "../utils/base_gogo.js";

function normalizeUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${GOGO_BASE}/${url.replace(/^\//, "").replace(/\/$/, "")}/`;
}

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
    // return the data directly, NOT res
    return streamInfo;
  } catch (e) {
    console.error("[GogoStreamController]", e.message);
    return { error: e.message };
  }
};

export const getGogoServers = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, message: "Missing param: url" });
    }
    const servers = await extractGogoServers(normalizeUrl(url));
    return servers;
  } catch (e) {
    console.error("[GogoServersController]", e.message);
    return { error: e.message };
  }
};
