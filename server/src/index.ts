import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";

const server = createApp().listen(config.port, () => {
  console.log(`\n  SubletU API  →  http://localhost:${config.port}/api/health`);
  console.log(`  Database     →  ${config.databaseFile}`);
  console.log(`  Uploads      →  ${config.uploadDir}`);
  console.log(`  CORS allows  →  ${config.corsOrigins.join(", ")}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
