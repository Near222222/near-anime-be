export function logRequest(req, res, next) {
  const startTime = Date.now();

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);

  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`,
    );
    return originalSend.call(this, data);
  };

  next();
}

export function errorHandler(err, req, res, next) {
  console.error(
    `[ERROR] ${new Date().toISOString()} - ${req.path}:`,
    err.message,
  );

  res.status(500).json({
    success: false,
    error: err.message,
    timestamp: new Date().toISOString(),
  });
}
