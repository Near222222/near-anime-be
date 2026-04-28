import {
  searchAnimePahe,
  getAnimePaheEpisodes,
  extractAnimePaheStream,
  getAnimePaheStreamByName,
} from "../extractors/animepahe.extractor.js";

// GET /api/pahe/search?q=bleach
export async function searchPahe(req, res) {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: "q param required" });

    const results = await searchAnimePahe(q);
    if (!results) return res.status(404).json({ error: "No results found" });

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/pahe/episodes?session=xxx&page=1
export async function getPaheEpisodes(req, res) {
  try {
    const { session, page = 1 } = req.query;
    if (!session)
      return res.status(400).json({ error: "session param required" });

    const data = await getAnimePaheEpisodes(session, parseInt(page));
    if (!data) return res.status(404).json({ error: "Episodes not found" });

    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/pahe/stream?session=xxx&ep=1&quality=1080
export async function getPaheStream(req, res) {
  try {
    const { session, ep, quality = "1080" } = req.query;
    if (!session || !ep) {
      return res.status(400).json({ error: "session and ep params required" });
    }

    const stream = await extractAnimePaheStream(
      session,
      parseFloat(ep),
      quality,
    );
    if (!stream)
      return res.status(500).json({ error: "Could not extract stream" });

    res.json({ success: true, ...stream });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/stream?name=bleach&ep=1&quality=1080
// (drop-in replacement for the old HiAnime /api/stream)
export async function getStreamByName(req, res) {
  try {
    const { name, ep, quality = "1080" } = req.query;
    if (!name || !ep) {
      return res.status(400).json({ error: "name and ep params required" });
    }

    const stream = await getAnimePaheStreamByName(
      name,
      parseFloat(ep),
      quality,
    );
    if (!stream)
      return res.status(500).json({ error: "Could not extract stream" });

    res.json({ success: true, ...stream });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
