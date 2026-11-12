import type { Plugin } from "vite";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildPack, readLibrary } = require("./builtin-pack.cjs");

export function builtinLibraryPlugin(): Plugin {
  return {
    name: "builtin-library-development",
    async buildStart() {
      await buildPack();
    },
    configureServer(server) {
      server.middlewares.use(
        "/__builtin-library",
        async (_request, response) => {
          try {
            const library = await readLibrary();
            response.setHeader(
              "Content-Type",
              "application/json; charset=utf-8",
            );
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify(library));
          } catch (error) {
            response.statusCode = 500;
            response.end("Builtin library unavailable.");
            server.config.logger.error(String(error));
          }
        },
      );
    },
  };
}
