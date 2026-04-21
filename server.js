import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createApiRoutes } from "./src/routes/apiRoutes.js";

// ============================================================================
// IMPORT LOGGING MIDDLEWARE (Optional but recommended)
// ============================================================================
// Uncomment these if you created the logging middleware file
// import { logRequest, errorHandler } from './src/middleware/logging.middleware.js';

// ============================================================================
// CONFIGURATION
// ============================================================================
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4444;
const NODE_ENV = process.env.NODE_ENV || "production";
const DEBUG = process.env.DEBUG === "true";
const __filename = fileURLToPath(import.meta.url);
const publicDir = path.join(dirname(__filename), "public");
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",");

// ============================================================================
// LOGGING SETUP
// ============================================================================
const log = {
  info: (msg) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
  warn: (msg) => console.log(`[${new Date().toISOString()}] [WARN] ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`),
  debug: (msg) => {
    if (DEBUG) {
      console.log(`[${new Date().toISOString()}] [DEBUG] ${msg}`);
    }
  },
};

log.info(`Starting server in ${NODE_ENV} mode`);

// ============================================================================
// CORS CONFIGURATION
// ============================================================================
app.use(
  cors({
    origin: allowedOrigins?.includes("*") ? "*" : allowedOrigins || [],
    methods: ["GET"],
  }),
);

// Custom CORS middleware with logging
app.use((req, res, next) => {
  const origin = req.headers.origin;
  log.debug(`CORS check - Origin: ${origin}`);

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

// ============================================================================
// REQUEST LOGGING MIDDLEWARE
// ============================================================================
app.use((req, res, next) => {
  const startTime = Date.now();
  log.info(`${req.method} ${req.path}`);

  // Capture response send
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    log.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    return originalSend.call(this, data);
  };

  next();
});

// ============================================================================
// OPTIONAL: LOAD LOGGING MIDDLEWARE (if file exists)
// ============================================================================
// If you created the logging.middleware.js file, uncomment below:
// app.use(logRequest);

// ============================================================================
// STATIC FILES
// ============================================================================
app.use(express.static(publicDir, { redirect: false }));
log.info(`Serving static files from: ${publicDir}`);

// ============================================================================
// BODY PARSER & JSON
// ============================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// RESPONSE HELPERS
// ============================================================================
const jsonResponse = (res, data, status = 200) => {
  log.debug(`Sending success response - Status: ${status}`);
  return res.status(status).json({ success: true, results: data });
};

const jsonError = (res, message = "Internal server error", status = 500) => {
  log.error(`Sending error response - Status: ${status}, Message: ${message}`);
  return res.status(status).json({ success: false, message });
};

// ============================================================================
// HEALTH CHECK ENDPOINT (Useful for monitoring)
// ============================================================================
app.get("/health", (req, res) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
  };
  log.debug(`Health check requested`);
  res.status(200).json(health);
});

// ============================================================================
// API ROUTES
// ============================================================================
log.info("Setting up API routes...");
createApiRoutes(app, jsonResponse, jsonError);
log.info("API routes configured");

// ============================================================================
// 404 ERROR HANDLER
// ============================================================================
app.use((req, res) => {
  log.warn(`404 Not Found - ${req.method} ${req.path}`);
  const filePath = path.join(publicDir, "404.html");

  if (fs.existsSync(filePath)) {
    res.status(404).sendFile(filePath);
  } else {
    res.status(404).json({
      success: false,
      message: "Not found",
    });
  }
});

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================
app.use((err, req, res, next) => {
  log.error(`Unhandled Error - ${err.message}`);
  log.error(`Stack: ${err.stack}`);

  const status = err.status || 500;
  const message =
    NODE_ENV === "production" ? "Internal server error" : err.message;

  res.status(status).json({
    success: false,
    message,
    ...(NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ============================================================================
// OPTIONAL: LOAD ERROR HANDLER MIDDLEWARE (if file exists)
// ============================================================================
// If you created the logging.middleware.js file, uncomment below:
// app.use(errorHandler);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
process.on("SIGTERM", () => {
  log.info("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    log.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  log.info("SIGINT received, shutting down gracefully...");
  server.close(() => {
    log.info("Server closed");
    process.exit(0);
  });
});

// ============================================================================
// START SERVER
// ============================================================================
const server = app.listen(PORT, () => {
  log.info(`✅ Server started successfully`);
  log.info(`🌍 Listening at http://localhost:${PORT}`);
  log.info(`📁 Public directory: ${publicDir}`);
  log.info(`🔧 Environment: ${NODE_ENV}`);
  if (allowedOrigins) {
    log.info(`🔐 CORS origins: ${allowedOrigins.join(", ")}`);
  }
});

// Handle server errors
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    log.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    log.error(`Server error: ${err.message}`);
  }
});

export default app;
