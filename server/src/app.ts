import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { config, SERVER_ROOT } from "./config.ts";
import { db } from "./db.ts";
import { ValidationError } from "./domain/Data.ts";
import { HttpError } from "./lib/http.ts";
import { attachUser } from "./middleware/auth.ts";
import { authRouter } from "./routes/auth.ts";
import { listingsRouter } from "./routes/listings.ts";
import { messagesRouter } from "./routes/messages.ts";
import { geoRouter, referenceRouter, reportsRouter, settingsRouter } from "./routes/misc.ts";
import { savedRouter } from "./routes/saved.ts";
import { swipesRouter } from "./routes/swipes.ts";

/**
 * Builds the Express app without binding a port. `index.ts` starts it for real;
 * the test suite hands the same app to a throwaway listener. Keeping these
 * apart is what lets tests exercise the HTTP layer at all.
 */
export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      const host = req.headers.host;

      // When the API also serves the built front end, requests are same-origin
      // and carry this server's own Origin — always allow those, or production
      // single-origin mode blocks itself.
      const sameOrigin =
        !!origin && !!host && (origin === `http://${host}` || origin === `https://${host}`);

      // Requests with no Origin at all are non-browser callers (curl, tests).
      const allowed = !origin || sameOrigin || config.corsOrigins.includes(origin);

      // Denying by omitting the header lets the browser enforce it, instead of
      // throwing and turning a policy decision into a 500.
      callback(null, { origin: allowed, credentials: true });
    }),
  );

  // Photos arrive as base64 data URLs, so the JSON body limit has to be generous.
  app.use(express.json({ limit: "14mb" }));
  app.use(attachUser);

  if (!config.isProd && process.env.NODE_ENV !== "test") {
    app.use((req, _res, next) => {
      console.log(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  /* ---------------------------------------------------------------- static */

  app.use(
    "/uploads",
    express.static(config.uploadDir, {
      maxAge: "7d",
      // Never serve anything but the images we wrote.
      setHeaders(res) {
        res.setHeader("X-Content-Type-Options", "nosniff");
      },
    }),
  );

  /* ------------------------------------------------------------------- api */

  app.get("/api/health", (_req, res) => {
    const listings = db
      .prepare("SELECT COUNT(*) AS n FROM listings WHERE status = 'active'")
      .get() as { n: number };
    const users = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
    res.json({
      ok: true,
      service: "subletu-api",
      activeListings: listings.n,
      users: users.n,
      time: new Date().toISOString(),
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api/swipes", swipesRouter);
  app.use("/api/saved", savedRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/geo", geoRouter);
  app.use("/api/reference", referenceRouter);

  /* ----------------------------------------- production single-origin serve */

  const webDist = path.resolve(SERVER_ROOT, "../web/dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api|uploads).*/, (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  /* ---------------------------------------------------------------- errors */

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
      return;
    }
    next();
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details ?? undefined });
      return;
    }
    if (err instanceof ValidationError) {
      res.status(422).json({ error: "Validation failed", problems: err.problems });
      return;
    }
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Request body is not valid JSON" });
      return;
    }
    console.error("[unhandled]", err);
    res.status(500).json({ error: "Something went wrong on our end" });
  });

  return app;
}
