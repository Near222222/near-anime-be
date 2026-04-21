import axios from "axios";
import CryptoJS from "crypto-js";
import * as cheerio from "cheerio";
import { v1_base_url } from "../../utils/base_v1.js";
import { v4_base_url } from "../../utils/base_v4.js";
import { fallback_1, fallback_2 } from "../../utils/fallback.js";
import { DEFAULT_HEADERS } from "../../configs/header.config.js";

function fetch_key(data) {
  let key = null;

  const xyMatch = data.match(/window\._xy_ws\s*=\s*["']([^"']+)["']/);
  if (xyMatch) {
    key = xyMatch[1];
  }

  if (!key) {
    const lkMatch = data.match(/window\._lk_db\s*=\s*\{([^}]+)\}/);
    if (lkMatch) {
      key = [...lkMatch[1].matchAll(/:\s*["']([^"']+)["']/g)]
        .map((v) => v[1])
        .join("");
    }
  }

  if (!key) {
    const nonceMatch = data.match(/nonce\s*=\s*["']([^"']+)["']/);
    if (nonceMatch) {
      key = nonceMatch[1];
    }
  }

  if (!key) {
    const dpiMatch = data.match(/data-dpi\s*=\s*["']([^"']+)["']/);
    if (dpiMatch) {
      key = dpiMatch[1];
    }
  }

  if (!key) {
    const metaMatch = data.match(
      /<meta[^>]*name\s*=\s*["']_gg_fb["'][^>]*content\s*=\s*["']([^"']+)["']/i,
    );
    if (metaMatch) {
      key = metaMatch[1];
    }
  }

  if (!key) {
    const isThMatch = data.match(/_is_th\s*:\s*([A-Za-z0-9]+)/);
    if (isThMatch) {
      key = isThMatch[1];
    }
  }

  return key;
}

// Helper function to extract sourceId with multiple fallback patterns
function extractSourceId(ajaxLink) {
  if (!ajaxLink) return null;

  // Pattern 1: /embed-2/v3/e-1/{sourceId}?k=
  let match = ajaxLink.match(/\/e-1\/([^/?]+)/);
  if (match?.[1]) {
    console.log(`[DEBUG] SourceID matched by pattern 1: ${match[1]}`);
    return match[1];
  }

  // Pattern 2: /embed/v3/e/{sourceId}?
  match = ajaxLink.match(/\/e\/([^/?]+)/);
  if (match?.[1]) {
    console.log(`[DEBUG] SourceID matched by pattern 2: ${match[1]}`);
    return match[1];
  }

  // Pattern 3: /embed-2/e/{sourceId}
  match = ajaxLink.match(/\/embed-2\/e\/([^/?]+)/);
  if (match?.[1]) {
    console.log(`[DEBUG] SourceID matched by pattern 3: ${match[1]}`);
    return match[1];
  }

  // Pattern 4: Last segment before query params
  const lastSegment = ajaxLink.split("/").pop()?.split("?")[0];
  if (lastSegment && lastSegment.length > 3) {
    console.log(
      `[DEBUG] SourceID matched by pattern 4 (last segment): ${lastSegment}`,
    );
    return lastSegment;
  }

  console.error(`[ERROR] Could not extract sourceId from: ${ajaxLink}`);
  return null;
}

// Helper function to build megacloud URL
function buildMegacloudUrl(sourceId) {
  return `https://megacloud.blog/embed-2/v3/e-1/${sourceId}?k=1`;
}

export async function decryptSources_v1(epID, id, name, type, fallback) {
  try {
    let decryptedSources = null;
    let iframeURL = null;

    if (fallback) {
      const fallback_server = ["hd-1", "hd-3"].includes(name.toLowerCase())
        ? fallback_1
        : fallback_2;

      iframeURL = `https://${fallback_server}/stream/s-2/${epID}/${type}`;

      const { data } = await axios.get(
        `https://${fallback_server}/stream/s-2/${epID}/${type}`,
        {
          headers: {
            Referer: `https://${fallback_server}/`,
          },
          timeout: 10000,
        },
      );

      const $ = cheerio.load(data);
      const dataId = $("#megaplay-player").attr("data-id");
      if (!dataId) {
        throw new Error("Could not find megaplay-player element");
      }

      const { data: decryptedData } = await axios.get(
        `https://${fallback_server}/stream/getSources?id=${dataId}`,
        {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
          timeout: 10000,
        },
      );
      decryptedSources = decryptedData;
    } else {
      // Fetch sources from the main API
      console.log(`[DEBUG] Fetching sources for epID=${epID}, id=${id}`);

      const { data: sourcesData } = await axios.get(
        `https://${v1_base_url}/ajax/v2/episode/sources?id=${id}`,
        {
          timeout: 10000,
        },
      );

      // Debug logging
      console.log(
        `[DEBUG] SourcesData keys: ${Object.keys(sourcesData || {}).join(", ")}`,
      );

      const ajaxLink = sourcesData?.link;
      if (!ajaxLink) {
        console.error(`[ERROR] Missing link in sourcesData`);
        throw new Error("Missing link in sourcesData");
      }

      console.log(`[DEBUG] Ajax link: ${ajaxLink.substring(0, 100)}...`);

      // Extract sourceId with multiple patterns
      const sourceId = extractSourceId(ajaxLink);
      if (!sourceId) {
        throw new Error("Unable to extract sourceId from link");
      }

      const new_url = buildMegacloudUrl(sourceId);
      console.log(`[DEBUG] Built megacloud URL: ${new_url}`);

      let decryptResponse = null;
      const errors = [];

      // Method 1: Try primary proxy
      console.log(
        `[DEBUG] Attempting method 1: Primary proxy (megacloud.zenime.site)`,
      );
      try {
        const { data: stream_data } = await axios.post(
          "https://megacloud.zenime.site/get-sources",
          { embedUrl: new_url },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
          },
        );
        decryptResponse = stream_data;
        console.log(`[SUCCESS] Got response from primary proxy`);
      } catch (primaryErr) {
        const errMsg = primaryErr?.response?.status ?? primaryErr.message;
        console.warn(`[WARN] Primary proxy failed: ${errMsg}`);
        errors.push(`Primary proxy: ${errMsg}`);

        // Method 2: Try direct megacloud getSources
        console.log(`[DEBUG] Attempting method 2: Direct megacloud getSources`);
        try {
          const { data: fallbackData } = await axios.get(
            `https://megacloud.blog/embed-2/ajax/e-1/getSources?id=${sourceId}`,
            {
              headers: {
                Referer: new_url,
                "X-Requested-With": "XMLHttpRequest",
                ...DEFAULT_HEADERS,
              },
              timeout: 10000,
            },
          );
          decryptResponse = fallbackData;
          console.log(`[SUCCESS] Got response from megacloud getSources`);
        } catch (fallbackErr) {
          const fallbackErrMsg =
            fallbackErr?.response?.status ?? fallbackErr.message;
          console.warn(`[WARN] megacloud getSources failed: ${fallbackErrMsg}`);
          errors.push(`megacloud getSources: ${fallbackErrMsg}`);

          // Method 3: Try alternative megacloud endpoint
          console.log(
            `[DEBUG] Attempting method 3: Alternative megacloud v3 endpoint`,
          );
          try {
            const { data: altData } = await axios.get(
              `https://megacloud.blog/embed-2/v3/e-1/${sourceId}`,
              {
                headers: {
                  Referer: "https://megacloud.blog/",
                  "X-Requested-With": "XMLHttpRequest",
                  ...DEFAULT_HEADERS,
                },
                timeout: 10000,
              },
            );
            decryptResponse = altData;
            console.log(
              `[SUCCESS] Got response from alternative megacloud endpoint`,
            );
          } catch (altErr) {
            const altErrMsg = altErr?.response?.status ?? altErr.message;
            console.error(`[ERROR] Alternative endpoint failed: ${altErrMsg}`);
            errors.push(`Alternative endpoint: ${altErrMsg}`);
            throw new Error(
              `All decryption methods failed: ${errors.join(" | ")}`,
            );
          }
        }
      }

      // Validate response
      if (!decryptResponse?.sources) {
        console.error(
          `[ERROR] Invalid decryptResponse structure:`,
          decryptResponse,
        );
        throw new Error("Invalid decrypted sources format");
      }

      decryptedSources = decryptResponse;
    }

    return {
      id,
      type,
      link: {
        file: fallback
          ? (decryptedSources?.sources?.file ?? "")
          : (decryptedSources?.sources?.[0]?.file ?? ""),
        type: "hls",
      },
      tracks: decryptedSources.tracks ?? [],
      intro: decryptedSources.intro ?? null,
      outro: decryptedSources.outro ?? null,
      iframe: iframeURL,
      server: name,
    };
  } catch (error) {
    console.error(
      `[CRITICAL] Error during decryptSources_v1(epID=${epID}, id=${id}, server=${name}): ${error.message}`,
    );
    return null;
  }
}
