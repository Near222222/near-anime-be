import axios from "axios";
import * as cheerio from "cheerio";
import { v1_base_url } from "../utils/base_v1.js";
// import decryptMegacloud from "../parsers/decryptors/megacloud.decryptor.js";
// import AniplayExtractor from "../parsers/aniplay.parser.js";
import { decryptSources_v1 } from "../parsers/decryptors/decrypt_v1.decryptor.js";

export async function extractServers(id) {
  try {
    const resp = await axios.get(
      `https://${v1_base_url}/ajax/v2/episode/servers?episodeId=${id}`,
    );

    const html = resp.data?.html ?? resp.data;
    const $ = cheerio.load(html);
    const serverData = [];

    // Try primary selector
    let elements = $(".server-item");

    // Fallback selectors if primary fails
    if (elements.length === 0) {
      console.warn("[WARN] No .server-item found, trying .server");
      elements = $(".server");
    }
    if (elements.length === 0) {
      console.warn("[WARN] No .server found, trying [data-server-id]");
      elements = $("[data-server-id]");
    }

    console.log(`[INFO] Found ${elements.length} server elements`);

    elements.each((index, element) => {
      const data_id = $(element).attr("data-id")?.trim();
      const server_id = $(element).attr("data-server-id")?.trim();
      const type = $(element).attr("data-type")?.trim();
      const serverName = $(element).find("a").text().trim();

      if (serverName) {
        console.log(`[DEBUG] Server ${index}: ${serverName} (${type})`);
        serverData.push({
          type: type || "raw",
          data_id,
          server_id,
          serverName,
        });
      }
    });

    console.log(`[SUCCESS] Extracted ${serverData.length} servers`);
    return serverData;
  } catch (error) {
    console.error(`[ERROR] extractServers failed: ${error.message}`);
    return [];
  }
}

async function extractStreamingInfo(id, name, type, fallback) {
  try {
    const servers = await extractServers(id.split("?ep=").pop());
    let requestedServer = servers.filter(
      (server) =>
        server.serverName.toLowerCase() === name.toLowerCase() &&
        server.type.toLowerCase() === type.toLowerCase(),
    );
    if (requestedServer.length === 0) {
      requestedServer = servers.filter(
        (server) =>
          server.serverName.toLowerCase() === name.toLowerCase() &&
          server.type.toLowerCase() === "raw",
      );
    }
    if (requestedServer.length === 0) {
      throw new Error(
        `No matching server found for name: ${name}, type: ${type}`,
      );
    }
    const streamingLink = await decryptSources_v1(
      id,
      requestedServer[0].data_id,
      name,
      type,
      fallback,
    );
    return { streamingLink, servers };
  } catch (error) {
    console.error("An error occurred:", error);
    return { streamingLink: [], servers: [] };
  }
}
export { extractStreamingInfo };
