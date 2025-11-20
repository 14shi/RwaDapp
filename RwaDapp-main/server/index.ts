import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { blockchainIndexer } from "./indexer";
import { cleanupProviders } from "./providers/eth";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// Determine application mode: 'demo' or 'real'
// Real mode is enabled if contract addresses are configured
export const APP_MODE = process.env.APP_MODE || 
  (process.env.VITE_NFT_CONTRACT_ADDRESS && process.env.VITE_ORACLE_FACTORY_ADDRESS ? 'real' : 'demo');

log(`Application Mode: ${APP_MODE.toUpperCase()}`);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Use the unified error handler middleware
  app.use(errorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // Start blockchain indexer after server is running
    try {
      log('Starting blockchain indexer...');
      await blockchainIndexer.start();
      log('Blockchain indexer started successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Failed to start blockchain indexer: ${errorMsg}`);
      // Continue without indexer (app will still work with manual blockchain calls)
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('Shutting down gracefully...');
    blockchainIndexer.stop();
    cleanupProviders();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('Shutting down gracefully...');
    blockchainIndexer.stop();
    cleanupProviders();
    process.exit(0);
  });
})();
