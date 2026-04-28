import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { GOGO_BASE } from "../utils/base_gogo.js";

puppeteer.use(StealthPlugin());

// Dedup map — concurrent requests for the same URL share one browser run
const pendingPages = new Map();

const IS_WINDOWS = process.platform === "win32";

async function launchBrowser() {
  return await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      // --single-process crashes Chromium on Windows and causes frame detach
      // errors — only add it on Linux (e.g. Docker/Render)
      ...(!IS_WINDOWS ? ["--no-zygote", "--single-process"] : []),
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
}

// Internal implementation — always receives a fully-qualified URL
async function _parseEpisodePage(fullUrl) {
  console.log(`[GogoExtractor] Launching browser for: ${fullUrl}`);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    );

    // Block images/fonts para mabilis
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "font", "stylesheet"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // domcontentloaded is faster and more stable than networkidle2 on
    // ad-heavy sites where frames get injected/removed rapidly.
    // Wrapped in try/catch because anitaku.at's JS redirects can detach
    // the frame mid-navigation — we can usually still read the DOM after.
    try {
      await page.goto(fullUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    } catch (navErr) {
      if (navErr.message.includes("detached")) {
        console.warn(
          `[GogoExtractor] Frame detached during navigation (expected on redirect) — continuing`,
        );
      } else {
        throw navErr; // rethrow real errors (timeout, net::ERR_*)
      }
    }

    // Give dynamic content a moment to inject iframes
    await new Promise((r) => setTimeout(r, 2500));

    // Hintayin ang iframe na mag-appear
    try {
      await page.waitForSelector("iframe", { timeout: 10000 });
    } catch (_) {
      console.warn(`[GogoExtractor] No iframe appeared within 10s`);
    }

    // Guard against frames being detached between waitForSelector and evaluate
    let iframes = [];
    try {
      iframes = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("iframe"))
          .map((el) => el.src || el.getAttribute("data-src"))
          .filter(Boolean)
          .map((src) => (src.startsWith("//") ? `https:${src}` : src));
      });
    } catch (evalErr) {
      console.warn(
        `[GogoExtractor] Frame detached during iframe eval: ${evalErr.message}`,
      );
      // iframes stays []
    }

    let postId = null;
    try {
      postId = await page.evaluate(() => {
        const match = document.body.innerHTML.match(/postid-(\d+)/);
        return match ? match[1] : null;
      });
    } catch (evalErr) {
      console.warn(
        `[GogoExtractor] Frame detached during postId eval: ${evalErr.message}`,
      );
    }

    const epMatch = fullUrl.match(/episode-(\d+(?:\.\d+)?)/i);
    const epNum = epMatch ? epMatch[1] : "1";

    console.log(
      `[GogoExtractor] postId=${postId} epNum=${epNum} iframes=${iframes.length}`,
    );
    if (iframes.length > 0)
      console.log(
        `[GogoExtractor] First iframe: ${iframes[0].substring(0, 80)}`,
      );

    return { postId, epNum, iframes, fullUrl };
  } finally {
    await browser.close();
  }
}

// Public export — deduplicates concurrent calls for the same URL
export async function parseEpisodePage(episodeUrl) {
  const fullUrl = episodeUrl.startsWith("http")
    ? episodeUrl
    : `${GOGO_BASE}/${episodeUrl.replace(/^\//, "").replace(/\/$/, "")}/`;

  if (pendingPages.has(fullUrl)) {
    console.log(`[GogoExtractor] Reusing in-flight request for: ${fullUrl}`);
    return pendingPages.get(fullUrl);
  }

  const promise = _parseEpisodePage(fullUrl).finally(() => {
    pendingPages.delete(fullUrl);
  });

  pendingPages.set(fullUrl, promise);
  return promise;
}

export async function resolveHlsFromEmbed(embedUrl) {
  if (!embedUrl) return null;
  const url = embedUrl.startsWith("//") ? `https:${embedUrl}` : embedUrl;

  console.log(`[GogoExtractor] Resolving HLS from: ${url.substring(0, 60)}`);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    let hlsUrl = null;

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    );

    // Intercept network requests para hanapin ang .m3u8
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const reqUrl = req.url();
      if (reqUrl.includes(".m3u8") && !hlsUrl) {
        hlsUrl = reqUrl;
        console.log(
          `[GogoExtractor] Intercepted HLS: ${reqUrl.substring(0, 80)}`,
        );
      }
      if (["image", "font", "stylesheet"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
    } catch (navErr) {
      if (navErr.message.includes("detached")) {
        console.warn(
          `[GogoExtractor] Frame detached during embed navigation — continuing`,
        );
      } else {
        throw navErr;
      }
    }

    // Give the embed player time to fire its network requests
    await new Promise((r) => setTimeout(r, 2500));

    // Kung hindi pa nakuha sa intercept, hanapin sa page source
    if (!hlsUrl) {
      try {
        hlsUrl = await page.evaluate(() => {
          const html = document.documentElement.innerHTML;
          const patterns = [
            /["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]{0,100})["'`]/,
            /"file"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]{0,100})"/,
            /sources\s*:\s*\[.*?"file"\s*:\s*"([^"]+)"/s,
          ];
          for (const p of patterns) {
            const m = html.match(p);
            if (m?.[1]) return m[1];
          }
          return null;
        });
      } catch (evalErr) {
        console.warn(
          `[GogoExtractor] Frame detached during HLS eval: ${evalErr.message}`,
        );
      }
    }

    if (hlsUrl) {
      console.log(`[GogoExtractor] Found HLS: ${hlsUrl.substring(0, 80)}`);
    } else {
      console.warn(`[GogoExtractor] No HLS found in: ${url.substring(0, 60)}`);
    }

    return hlsUrl;
  } finally {
    await browser.close();
  }
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
    const { iframes } = await parseEpisodePage(episodeUrl);

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
