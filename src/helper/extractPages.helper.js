import axios from "axios";
import * as cheerio from "cheerio";
import { v1_base_url } from "../utils/base_v1.js";
import { DEFAULT_HEADERS } from "../configs/header.config.js";

const axiosInstance = axios.create({ headers: DEFAULT_HEADERS });

// Retry with exponential backoff for 503/rate-limit errors
async function axiosGetWithRetry(url, options = {}, retries = 3, delay = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axiosInstance.get(url, options);
    } catch (err) {
      const status = err?.response?.status;
      const isRetryable = [503, 429, 502, 504].includes(status);
      if (isRetryable && attempt < retries) {
        console.warn(
          `[Retry ${attempt}/${retries}] ${status} on ${url} — waiting ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay * attempt));
      } else {
        throw err;
      }
    }
  }
}

async function extractPage(page, params) {
  try {
    const resp = await axiosGetWithRetry(
      `https://${v1_base_url}/${params}?page=${page}`,
    );
    const $ = cheerio.load(resp.data);
    const totalPages =
      Number(
        $('.pre-pagination nav .pagination > .page-item a[title="Last"]')
          ?.attr("href")
          ?.split("=")
          .pop() ??
          $('.pre-pagination nav .pagination > .page-item a[title="Next"]')
            ?.attr("href")
            ?.split("=")
            .pop() ??
          $(".pre-pagination nav .pagination > .page-item.active a")
            ?.text()
            ?.trim(),
      ) || 1;

    const contentSelector = params.includes("az-list")
      ? ".tab-content"
      : "#main-content";
    const data = await Promise.all(
      $(`${contentSelector} .film_list-wrap .flw-item`).map(
        async (index, element) => {
          const $fdiItems = $(".film-detail .fd-infor .fdi-item", element);
          const showType = $fdiItems
            .filter((_, item) => {
              const text = $(item).text().trim().toLowerCase();
              return ["tv", "ona", "movie", "ova", "special", "music"].some(
                (type) => text.includes(type),
              );
            })
            .first();
          const poster = $(".film-poster>img", element).attr("data-src");
          const title = $(".film-detail .film-name", element).text();
          const japanese_title = $(".film-detail>.film-name>a", element).attr(
            "data-jname",
          );
          const description = $(".film-detail .description", element)
            .text()
            .trim();
          const data_id = $(".film-poster>a", element).attr("data-id");
          const id = $(".film-poster>a", element).attr("href").split("/").pop();
          const tvInfo = {
            showType: showType ? showType.text().trim() : "Unknown",
            duration: $(".film-detail .fd-infor .fdi-duration", element)
              .text()
              .trim(),
          };
          let adultContent = false;
          const tickRateText = $(".film-poster>.tick-rate", element)
            .text()
            .trim();
          if (tickRateText.includes("18+")) {
            adultContent = true;
          }
          ["sub", "dub", "eps"].forEach((property) => {
            const value = $(`.tick .tick-${property}`, element).text().trim();
            if (value) {
              tvInfo[property] = value;
            }
          });
          return {
            id,
            data_id,
            poster,
            title,
            japanese_title,
            description,
            tvInfo,
            adultContent,
          };
        },
      ),
    );
    return [data, parseInt(totalPages, 10)];
  } catch (error) {
    console.error(`Error extracting data from page ${page}:`, error.message);
    throw error;
  }
}

export default extractPage;
