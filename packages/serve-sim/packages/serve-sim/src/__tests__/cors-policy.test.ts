import { describe, expect, test } from "bun:test";
import { answerThrownErrors, connectToFetch } from "../connect-to-fetch";
import { simMiddleware } from "../middleware";

const OFFER = "http://localhost/.sim/helper/00000000-0000-4000-8000-000000000000/webrtc/offer";

function preflight(origin?: string): Request {
  return new Request(OFFER, {
    method: "OPTIONS",
    headers: {
      "access-control-request-method": "POST",
      ...(origin ? { origin } : {}),
    },
  });
}

describe("CORS preflight", () => {
  test("returns a bodyless 204 through the Connect-to-Fetch adapter", async () => {
    const middleware = simMiddleware({ basePath: "/.sim", proxyHelpers: true });
    const response = await middleware(preflight());

    expect(response?.status).toBe(204);
    expect(await response?.text()).toBe("");
    expect(response?.headers.get("access-control-allow-methods")).toContain("OPTIONS");
  });

  test("allows the clipboard write's PUT", async () => {
    const middleware = simMiddleware({ basePath: "/.sim", corsOrigins: ["https://expo.dev"] });
    const response = await middleware(preflight("https://expo.dev"));

    expect(response?.headers.get("access-control-allow-methods")).toContain("PUT");
  });

  test("names the configured origin rather than allowing every site", async () => {
    const middleware = simMiddleware({ basePath: "/.sim", corsOrigins: ["https://expo.dev"] });
    const response = await middleware(preflight("https://expo.dev"));

    expect(response?.headers.get("access-control-allow-origin")).toBe("https://expo.dev");
    expect(response?.headers.get("vary")).toBe("Origin");
  });

  test("tells an unconfigured origin nothing, but still varies on Origin", async () => {
    const middleware = simMiddleware({ basePath: "/.sim", corsOrigins: ["https://expo.dev"] });
    const response = await middleware(preflight("https://evil.test"));

    expect(response?.headers.get("access-control-allow-origin")).toBeNull();
    // Without this a shared cache could replay the refusal to an origin that is allowed.
    expect(response?.headers.get("vary")).toBe("Origin");
  });

  test("names a deploy preview matched by a wildcard", async () => {
    const middleware = simMiddleware({ basePath: "/.sim", corsOrigins: ["https://*.expo.dev"] });
    const response = await middleware(preflight("https://pr-31018.expo.dev"));

    expect(response?.headers.get("access-control-allow-origin")).toBe("https://pr-31018.expo.dev");
    expect(response?.headers.get("vary")).toBe("Origin");
  });

  test("answers a preflight before the token gate, which it cannot satisfy", async () => {
    const middleware = simMiddleware({
      basePath: "/.sim",
      requirePreviewToken: true,
      corsOrigins: ["https://expo.dev"],
    });
    const response = await middleware(preflight("https://expo.dev"));

    expect(response?.status).toBe(204);
    expect(response?.headers.get("access-control-allow-origin")).toBe("https://expo.dev");
  });
});

describe("CORS policy", () => {
  // The middleware sets its CORS headers before any route runs; a route that throws keeps them.
  test("keeps the headers on a route that throws, and names no detail", async () => {
    const route = answerThrownErrors(async (_req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "https://expo.dev");
      res.setHeader("Vary", "Origin");
      throw new Error("/private/state.json: EACCES");
    });

    const response = await connectToFetch(route, new Request("http://localhost/.sim/api"));

    expect(response?.status).toBe(500);
    expect(response?.headers.get("access-control-allow-origin")).toBe("https://expo.dev");
    expect(response?.headers.get("vary")).toBe("Origin");
    expect(await response?.text()).toBe("Internal Server Error");
  });


  test("keeps the headers on a gated 401, so the browser can read the status", async () => {
    const middleware = simMiddleware({
      basePath: "/.sim",
      requirePreviewToken: true,
      corsOrigins: ["https://expo.dev"],
    });
    const response = await middleware(
      new Request("http://localhost/.sim/api", { headers: { origin: "https://expo.dev" } }),
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.get("access-control-allow-origin")).toBe("https://expo.dev");
  });

  test("leaves a mounted host app's own preflight alone", async () => {
    const middleware = simMiddleware({ basePath: "/.sim", corsOrigins: ["https://expo.dev"] });
    const response = await middleware(
      new Request("http://localhost/api/orders", {
        method: "OPTIONS",
        headers: { origin: "https://expo.dev" },
      }),
    );

    expect(response).toBeUndefined();
  });
});
