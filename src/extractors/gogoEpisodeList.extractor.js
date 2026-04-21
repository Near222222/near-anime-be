import axios from "axios";
import * as cheerio from "cheerio";
import { GOGO_BASE } from "../utils/base_gogo.js";

// Scrape series page and return episode list
// seriesSlug: "anime-slug" or full URL "https://gogoanime.by/series/anime-slug/"
async function extractGogoEpisodeList(seriesSlug) {
  try {
    const url = seriesSlug.startsWith("http")
      ? seriesSlug
      : `${GOGO_BASE}/series/${seriesSlug}/`;

    const { data: html } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        Referer: GOGO_BASE,
      },
      timeout: 15000,
    });

    const $ = cheerio.load(html);
    const episodes = [];

    $("a[href*='episode-']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const epMatch = href.match(/episode-(\d+(?:\.\d+)?)/i);
      if (!epMatch) return;

      const epNo = parseFloat(epMatch[1]);
      const slug = href
        .replace(GOGO_BASE, "")
        .replace(/^\//, "")
        .replace(/\/$/, "");

      if (!episodes.find((e) => e.episode_no === epNo)) {
        episodes.push({
          episode_no: epNo,
          id: slug, // use as the "id" param for /api/stream/gogo
          url: href,
          title: $(el).text().trim() || `Episode ${epNo}`,
          filler: false,
        });
      }
    });

    episodes.sort((a, b) => a.episode_no - b.episode_no);
    return { totalEpisodes: episodes.length, episodes };
  } catch (error) {
    console.error(`[GogoEpisodeList] Failed: ${error.message}`);
    return { totalEpisodes: 0, episodes: [] };
  }
}

export default extractGogoEpisodeList;
