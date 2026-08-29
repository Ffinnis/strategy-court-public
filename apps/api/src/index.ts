import { createApp } from "./app";
import { resolve, sep } from "node:path";
import { attachClientIp } from "./client-ip";

const app = await createApp();
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
const webRoot = resolve(import.meta.dir, "../../web/dist");
const webIndex = Bun.file(resolve(webRoot, "index.html"));

async function fetchRequest(request: Request, server: Bun.Server<unknown>): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return app.fetch(attachClientIp(request, server.requestIP(request)?.address));
  }
  if (request.method !== "GET" && request.method !== "HEAD") return app.fetch(request);

  try {
    const candidatePath = resolve(webRoot, `.${decodeURIComponent(url.pathname)}`);
    const insideWebRoot = candidatePath === webRoot || candidatePath.startsWith(`${webRoot}${sep}`);
    if (insideWebRoot && candidatePath !== webRoot) {
      const candidate = Bun.file(candidatePath);
      if (await candidate.exists()) {
        return new Response(candidate, {
          headers: { "Cache-Control": url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" },
        });
      }
    }
  } catch {
    return app.fetch(request);
  }

  if (await webIndex.exists()) return new Response(webIndex, { headers: { "Cache-Control": "no-cache" } });
  return app.fetch(request);
}

const server = Bun.serve({
  port,
  fetch: fetchRequest,
});

console.log(`Strategy Court API listening on ${server.url}`);

let shutdownPromise: Promise<void> | undefined;
function shutdown(): Promise<void> {
  shutdownPromise ??= (async () => {
    server.stop();
    await app.close();
  })();
  return shutdownPromise;
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
