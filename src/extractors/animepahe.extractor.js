/**
 * AnimePahe Direct Extractor
 *
 * Flow:
 *   1. Search AnimePahe for anime → get session + anilist_id
 *   2. Get episode list → get episode session IDs
 *   3. Get Kwik embed URL via AnimePahe links API
 *   4. Extract m3u8 from Kwik embed page
 */

import axios from "axios";
import { PAHE_BASE, PAHE_API, KWIK_BASE } from "../utils/base_pahe.js";

const PAHE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: `${PAHE_BASE}/`,
  Accept: "application/json, text/plain, */*",
  "X-Requested-With": "XMLHttpRequest",
  Cookie:
    "__ddg1_=aEQPmWnK1YsvlQVyYFh2; __ddg2_=0uCu5MlMTLIeqNgN; __ddg8_=jYZOjHgrvunxUtSa; __ddg9_=136.158.41.61; __ddg10_=1777365764; __ddgid_=z0dy55JtZDUniNaT; animepahe_session=eyJpdiI6IktwUitORHZuMHFVWEFYVjdmaHY1Z2c9PSIsInZhbHVlIjoic1NVUUlKQ1g4K2xzVldiQXVlUld1c0hRcElrdzBOT2RMdGhkL1NFVEJZcG1QNk1aOWF6cGt1K09UWHJYT3A3cyt4cG1sY0RNMmx1ZmxHUG9iY01RNDN0b3J2U0dpT0lUK3hzY3VVdWU0RVA4T1VmWHZNY05TVmtsVTIzWkNjaFAiLCJtYWMiOiIyYmExYmM3MDRlOGRlMzllYzNjNGE3NTJkZWMzN2NmNzk4OTZiMDYzOTE1OWNjMmIzMDZkZGQzNzY3YmE3OTc5IiwidGFnIjoiIn0=; ann-fakesite=0; XSRF-TOKEN=eyJpdiI6ImlscFBQUXA1ZStSWllvSi9SSGxqanc9PSIsInZhbHVlIjoiYjRyaSs5ZjY0Y3FkOWFTSFR1eDdJc1RXYjVvM2hwMlc3VVRqTEt6c1Nvc0V5N20vWHJrOHkrRWY5TmNkVlZCWHpFQk1FWWJlTzhWYWczYmt2Z2krZHZ0c0sxWkVWdU9hdEVhL0E2WXBpd3JUWDhTNHY0SDBidExoSmwvck1xQ1kiLCJtYWMiOiIzNmZmYWNiYmNiYmRkM2E2MjY0NWIwZjg5NDBiYzc0ZmJmMDQ1MTZkNjZlYjBmNWIzN2YwY2JmOTczMTdlOTQzIiwidGFnIjoiIn0=",
};

const KWIK_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: `${PAHE_BASE}/`,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ─── Step 1: Search for anime ─────────────────────────────────────────────────

export async function searchAnimePahe(query) {
  try {
    console.log(`[AnimePahe] Searching: ${query}`);
    const response = await axios.get(PAHE_API, {
      params: { m: "search", q: query },
      maxRedirects: 10,
      validateStatus: () => true,
      headers: PAHE_HEADERS,
      timeout: 15000,
    });
    const data = response.data;
    console.log(`[AnimePahe] HTTP Status: ${response.status}`);
    console.log(`[AnimePahe] Final URL: ${response.request?.res?.responseUrl}`);

    console.log(
      `[AnimePahe] Raw response:`,
      JSON.stringify(data).substring(0, 500),
    );

    if (!data?.data?.length) {
      console.warn(`[AnimePahe] No results for: ${query}`);
      return null;
    }

    // Return first result — { session, title, id (anilist_id) }
    const results = data.data.map((r) => ({
      session: r.session,
      title: r.title,
      anilistId: r.id,
      type: r.type,
      episodes: r.episodes,
      status: r.status,
    }));

    console.log(`[AnimePahe] Found ${results.length} results`);
    return results;
  } catch (err) {
    console.error(`[AnimePahe] searchAnimePahe failed: ${err.message}`);
    return null;
  }
}

// ─── Step 2: Get episode list ─────────────────────────────────────────────────

export async function getAnimePaheEpisodes(animeSession, page = 1) {
  try {
    console.log(
      `[AnimePahe] Getting episodes for session: ${animeSession} page: ${page}`,
    );
    const response = await axios.get(PAHE_API, {
      params: {
        m: "release",
        id: animeSession,
        sort: "episode_asc",
        page,
      },
      headers: PAHE_HEADERS,
      timeout: 15000,
    });
    const data = response.data;
    console.log(`[AnimePahe] HTTP Status: ${response.status}`);
    console.log(`[AnimePahe] Final URL: ${response.request?.res?.responseUrl}`);

    if (!data?.data) {
      console.warn(`[AnimePahe] No episodes found`);
      return null;
    }

    return {
      total: data.total,
      perPage: data.per_page,
      currentPage: data.current_page,
      lastPage: data.last_page,
      episodes: data.data.map((ep) => ({
        session: ep.session, // episode session ID for kwik
        episode: ep.episode, // episode number
        snapshot: ep.snapshot,
        duration: ep.duration,
        audio: ep.audio,
        filler: ep.filler,
        disc: ep.disc,
      })),
    };
  } catch (err) {
    console.error(`[AnimePahe] getAnimePaheEpisodes failed: ${err.message}`);
    return null;
  }
}

// ─── Step 3: Get Kwik embed URL ───────────────────────────────────────────────

export async function getKwikLinks(animeSession, episodeSession) {
  try {
    console.log(
      `[AnimePahe] Getting kwik links for ep session: ${episodeSession}`,
    );
    const response = await axios.get(PAHE_API, {
      params: {
        m: "links",
        id: animeSession,
        session: episodeSession,
        p: "kwik",
      },
      headers: PAHE_HEADERS,
      timeout: 15000,
    });
    const data = response.data;
    console.log(`[AnimePahe] HTTP Status: ${response.status}`);
    console.log(`[AnimePahe] Final URL: ${response.request?.res?.responseUrl}`);

    if (!data?.data) {
      console.warn(`[AnimePahe] No kwik links found`);
      return null;
    }

    // data.data is an array of quality options
    // Each item: { "360": { kwik, kwik_pahewin }, "480": {...}, "720": {...}, "1080": {...} }
    const qualities = [];
    for (const item of data.data) {
      for (const [quality, links] of Object.entries(item)) {
        qualities.push({
          quality,
          kwik: links.kwik,
          kwikPahewin: links.kwik_pahewin,
        });
      }
    }

    console.log(
      `[AnimePahe] Found qualities: ${qualities.map((q) => q.quality).join(", ")}`,
    );
    return qualities;
  } catch (err) {
    console.error(`[AnimePahe] getKwikLinks failed: ${err.message}`);
    return null;
  }
}

// ─── Step 4: Extract m3u8 from Kwik ──────────────────────────────────────────

export async function extractKwikM3u8(kwikUrl) {
  try {
    console.log(
      `[AnimePahe] Extracting m3u8 from kwik: ${kwikUrl.substring(0, 60)}`,
    );

    // Kwik requires a Referer from animepahe and returns a redirect/form
    const response = await axios.get(kwikUrl, {
      headers: {
        ...KWIK_HEADERS,
        Referer: `${PAHE_BASE}/`,
      },
      timeout: 15000,
      maxRedirects: 5,
    });

    const html = response.data;

    // Method 1: Direct m3u8 in page source
    const m3u8Match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/);
    if (m3u8Match) {
      console.log(
        `[AnimePahe] Found m3u8 directly: ${m3u8Match[1].substring(0, 80)}`,
      );
      return { url: m3u8Match[1], key: null };
    }

    // Method 2: Kwik uses obfuscated JS — eval(function(p,a,c,k,e,d)...)
    // Deobfuscate the packed JS
    const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\).*\)\)/s);
    if (packedMatch) {
      const deobfuscated = deobfuscatePacked(packedMatch[0]);
      const m3u8InPacked = deobfuscated.match(
        /["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/,
      );
      if (m3u8InPacked) {
        console.log(
          `[AnimePahe] Found m3u8 in packed JS: ${m3u8InPacked[1].substring(0, 80)}`,
        );
        return { url: m3u8InPacked[1], key: null };
      }
    }

    // Method 3: Look for source in script tags
    const sourceMatch = html.match(/source\s*=\s*["'](https?:\/\/[^"']+)['"]/);
    if (sourceMatch) {
      console.log(
        `[AnimePahe] Found source: ${sourceMatch[1].substring(0, 80)}`,
      );
      return { url: sourceMatch[1], key: null };
    }

    // Method 4: Look for uwucdn pattern (miruro's CDN)
    const uwuMatch = html.match(
      /["'](https?:\/\/vault-\d+\.uwucdn\.top[^"']+\.m3u8)['"]/,
    );
    if (uwuMatch) {
      console.log(
        `[AnimePahe] Found uwucdn m3u8: ${uwuMatch[1].substring(0, 80)}`,
      );
      return { url: uwuMatch[1], key: null };
    }

    console.warn(`[AnimePahe] Could not find m3u8 in kwik page`);
    return null;
  } catch (err) {
    console.error(`[AnimePahe] extractKwikM3u8 failed: ${err.message}`);
    return null;
  }
}

// ─── Kwik JS deobfuscator (p,a,c,k,e,d pattern) ──────────────────────────────

function deobfuscatePacked(packed) {
  try {
    // Extract the packed string components
    const match = packed.match(
      /\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/,
    );
    if (!match) return "";

    let [, p, a, c, k] = match;
    a = parseInt(a);
    c = parseInt(c);
    k = k.split("|");

    const e = (c) => {
      return c < a
        ? ""
        : e(Math.floor(c / a)) +
            ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    };

    const d = {};
    while (c--) {
      if (k[c]) d[e(c)] = k[c];
    }

    return p.replace(/\b\w+\b/g, (word) => d[word] || word);
  } catch (_) {
    return "";
  }
}

// ─── Helper: Find episode session by number ───────────────────────────────────

export async function findEpisodeSession(animeSession, targetEpNumber) {
  let page = 1;
  let found = null;

  while (!found) {
    const data = await getAnimePaheEpisodes(animeSession, page);
    if (!data?.episodes?.length) break;

    found = data.episodes.find(
      (ep) => Math.abs(ep.episode - targetEpNumber) < 0.1,
    );

    if (page >= data.lastPage) break;
    page++;
  }

  if (found) {
    console.log(
      `[AnimePahe] Found ep ${targetEpNumber} session: ${found.session}`,
    );
  } else {
    console.warn(`[AnimePahe] Episode ${targetEpNumber} not found`);
  }

  return found ?? null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Extract stream info from AnimePahe
 *
 * @param {string} animeSession - AnimePahe anime session (from search)
 * @param {number} episodeNumber - Episode number
 * @param {string} quality - "1080", "720", "480", "360" (default: best available)
 * @returns {{ link, tracks, intro, outro, server, source } | null}
 */
export async function extractAnimePaheStream(
  animeSession,
  episodeNumber,
  quality = "1080",
) {
  try {
    console.log(
      `[AnimePahe] Extracting: session=${animeSession} ep=${episodeNumber} quality=${quality}`,
    );

    // Get episode session
    const episode = await findEpisodeSession(animeSession, episodeNumber);
    if (!episode) throw new Error(`Episode ${episodeNumber} not found`);

    // Get kwik links for all qualities
    const qualities = await getKwikLinks(animeSession, episode.session);
    if (!qualities?.length) throw new Error("No kwik links found");

    // Pick preferred quality, fallback to highest available
    const preferred =
      qualities.find((q) => q.quality === quality) ??
      qualities.find((q) => q.quality === "720") ??
      qualities[qualities.length - 1];

    console.log(`[AnimePahe] Using quality: ${preferred.quality}`);

    // Extract m3u8 from kwik
    const stream = await extractKwikM3u8(preferred.kwik);
    if (!stream?.url) throw new Error("Could not extract m3u8 from kwik");

    return {
      link: { file: stream.url, type: "hls" },
      tracks: [],
      intro: null,
      outro: null,
      server: `kwik-${preferred.quality}p`,
      source: "animepahe",
      qualities: qualities.map((q) => ({
        quality: q.quality,
        kwik: q.kwik,
      })),
    };
  } catch (err) {
    console.error(`[AnimePahe] extractAnimePaheStream failed: ${err.message}`);
    return null;
  }
}

/**
 * Search AnimePahe and get stream in one call
 *
 * @param {string} animeName - Anime title to search
 * @param {number} episodeNumber - Episode number
 * @param {string} quality - "1080", "720", "480", "360"
 */
export async function getAnimePaheStreamByName(
  animeName,
  episodeNumber,
  quality = "1080",
) {
  const results = await searchAnimePahe(animeName);
  if (!results?.length) {
    console.error(`[AnimePahe] Anime not found: ${animeName}`);
    return null;
  }

  // Use first result
  const anime = results[0];
  console.log(`[AnimePahe] Using: ${anime.title} (session: ${anime.session})`);

  return extractAnimePaheStream(anime.session, episodeNumber, quality);
}
