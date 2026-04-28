import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createApiRoutes } from "./src/routes/apiRoutes.js";
import {
  getGogoEmbed,
  getGogoStreamInfo,
} from "./src/controllers/gogoStream.controller.js";
import {
  searchPahe,
  getPaheEpisodes,
  getPaheStream,
  getStreamByName,
} from "./src/controllers/animepahe.controller.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4444;
const NODE_ENV = process.env.NODE_ENV || "production";
const DEBUG = process.env.DEBUG === "true";
const __filename = fileURLToPath(import.meta.url);
const publicDir = path.join(dirname(__filename), "public");
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",");

const log = {
  info: (msg) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
  warn: (msg) => console.log(`[${new Date().toISOString()}] [WARN] ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`),
  debug: (msg) => {
    if (DEBUG) console.log(`[${new Date().toISOString()}] [DEBUG] ${msg}`);
  },
};

log.info(`Starting server in ${NODE_ENV} mode`);

app.use(
  cors({
    origin: allowedOrigins?.includes("*") ? "*" : allowedOrigins || [],
    methods: ["GET"],
  }),
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    !allowedOrigins ||
    allowedOrigins.includes("*") ||
    (origin && allowedOrigins.includes(origin))
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return next();
  }
  log.warn(`CORS blocked - Origin not allowed: ${origin}`);
  res
    .status(403)
    .json({ success: false, message: "Forbidden: Origin not allowed" });
});

app.use((req, res, next) => {
  const startTime = Date.now();
  log.info(`${req.method} ${req.path}`);
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    log.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    return originalSend.call(this, data);
  };
  next();
});

app.use(express.static(publicDir, { redirect: false }));
log.info(`Serving static files from: ${publicDir}`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const jsonResponse = (res, data, status = 200) =>
  res.status(status).json({ success: true, results: data });
const jsonError = (res, message = "Internal server error", status = 500) =>
  res.status(status).json({ success: false, message });

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  });
});

// ── HiAnime-based routes (from apiRoutes.js) ──────────────────────────────────
log.info("Setting up API routes...");
createApiRoutes(app, jsonResponse, jsonError);
log.info("API routes configured");

// ── Gogoanime routes (Puppeteer) ──────────────────────────────────────────────
app.get("/api/gogo/embed", getGogoEmbed);
app.get("/api/gogo/stream", getGogoStreamInfo);

// ── AnimePahe routes (Primary stream source) ──────────────────────────────────
// Search anime → GET /api/pahe/search?q=bleach
app.get("/api/pahe/search", searchPahe);

// Episode list → GET /api/pahe/episodes?session=xxx&page=1
app.get("/api/pahe/episodes", getPaheEpisodes);

// Stream by session → GET /api/pahe/stream?session=xxx&ep=1&quality=1080
app.get("/api/pahe/stream", getPaheStream);

// Drop-in for old HiAnime /api/stream → GET /api/stream?name=bleach&ep=1&quality=1080
app.get("/api/stream", getStreamByName);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  log.warn(`404 Not Found - ${req.method} ${req.path}`);
  const filePath = path.join(publicDir, "404.html");
  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(404).json({ success: false, message: "Not found" });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  log.error(`Unhandled Error - ${err.message}`);
  const status = err.status || 500;
  const message =
    NODE_ENV === "production" ? "Internal server error" : err.message;
  res.status(status).json({
    success: false,
    message,
    ...(NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal) => {
  log.info(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    log.info("Server closed");
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  log.info(`✅ Server started successfully`);
  log.info(`🌍 Listening at http://localhost:${PORT}`);
  log.info(`📁 Public directory: ${publicDir}`);
  log.info(`🔧 Environment: ${NODE_ENV}`);
  if (allowedOrigins) log.info(`🔐 CORS origins: ${allowedOrigins.join(", ")}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    log.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else log.error(`Server error: ${err.message}`);
});

export default app;
