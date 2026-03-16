import { extractServers } from "../extractors/streamInfo.extractor.js";

export const getServers = async (req) => {
  try {
    const id = req.params.id || req.query.ep;
    const servers = await extractServers(id);
    return servers;
  } catch (e) {
    console.error(e);
    return e;
  }
};
