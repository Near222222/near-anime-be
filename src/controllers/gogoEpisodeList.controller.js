import extractGogoEpisodeList from "../extractors/gogoEpisodeList.extractor.js";

// GET /api/episodes/gogo?slug=anime-slug
// OR  GET /api/episodes/gogo?slug=https://gogoanime.by/series/anime-slug/
export const getGogoEpisodes = async (req, res) => {
  try {
    const slug = req.params?.slug || req.query?.slug;
    if (!slug) {
      return res
        .status(400)
        .json({ success: false, message: "Missing param: slug" });
    }
    const episodes = await extractGogoEpisodeList(slug);
    return episodes;
  } catch (e) {
    console.error("[GogoEpisodesController]", e);
    return { error: e.message };
  }
};
