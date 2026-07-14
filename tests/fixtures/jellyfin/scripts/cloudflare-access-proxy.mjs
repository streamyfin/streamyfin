#!/usr/bin/env node
import http from "node:http";
import https from "node:https";

const target = new URL(
  process.env.JELLYFIN_CF_PROXY_TARGET ?? "http://127.0.0.1:8096",
);
const host = process.env.JELLYFIN_CF_PROXY_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.JELLYFIN_CF_PROXY_PORT ?? "18096", 10);
const expectedClientId = process.env.MAESTRO_CF_ACCESS_CLIENT_ID ?? "";
const expectedClientSecret = process.env.MAESTRO_CF_ACCESS_CLIENT_SECRET ?? "";

function isAllowedTargetHost(hostname) {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  const private172Match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (private172Match) {
    const secondOctet = Number.parseInt(private172Match[1], 10);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

function validateTarget(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported proxy target protocol: ${url.protocol}`);
  }

  if (!isAllowedTargetHost(url.hostname)) {
    throw new Error(`Unsupported proxy target host: ${url.hostname}`);
  }
}

function resolveUpstreamUrl(requestUrl) {
  const rawUrl = requestUrl ?? "/";
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawUrl) || rawUrl.startsWith("//")) {
    throw new Error("Proxy request URL must be relative");
  }

  const relativeUrl = new URL(rawUrl, "http://streamyfin.invalid");
  const upstreamUrl = new URL(target);
  upstreamUrl.pathname = relativeUrl.pathname;
  upstreamUrl.search = relativeUrl.search;
  upstreamUrl.hash = "";
  return upstreamUrl;
}

validateTarget(target);

function log(message, fields = {}) {
  const details = Object.entries(fields)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  console.log(`[cf-proxy] ${message}${details ? ` ${details}` : ""}`);
}

function hasValidAccessHeaders(headers) {
  return (
    headers["cf-access-client-id"] === expectedClientId &&
    headers["cf-access-client-secret"] === expectedClientSecret
  );
}

function responseHeaders(headers) {
  const result = { ...headers };
  delete result.connection;
  delete result["keep-alive"];
  delete result["proxy-authenticate"];
  delete result["proxy-authorization"];
  delete result.te;
  delete result.trailer;
  delete result["transfer-encoding"];
  delete result.upgrade;
  return result;
}

const server = http.createServer((request, response) => {
  if (request.url === "/_cf_proxy_health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }

  if (!hasValidAccessHeaders(request.headers)) {
    log("rejected", {
      method: request.method,
      url: request.url,
      hasClientId: !!request.headers["cf-access-client-id"],
      hasClientSecret: !!request.headers["cf-access-client-secret"],
    });
    response.writeHead(403, { "content-type": "text/plain" });
    response.end("Missing or invalid Cloudflare Access headers");
    return;
  }

  try {
    const upstreamUrl = resolveUpstreamUrl(request.url);
    const headers = { ...request.headers, host: target.host };
    const transport = upstreamUrl.protocol === "https:" ? https : http;
    log("forward", {
      method: request.method,
      url: request.url,
      target: upstreamUrl.toString(),
    });

    const upstreamRequest = transport.request(
      upstreamUrl,
      {
        method: request.method,
        headers,
      },
      (upstreamResponse) => {
        let bytes = 0;
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          responseHeaders(upstreamResponse.headers),
        );

        upstreamResponse.on("data", (chunk) => {
          bytes += chunk.length;
        });
        upstreamResponse.on("end", () => {
          log("forwarded", {
            method: request.method,
            url: request.url,
            status: upstreamResponse.statusCode ?? 0,
            bytes,
          });
        });
        upstreamResponse.on("error", (error) => {
          log("upstream stream error", {
            method: request.method,
            url: request.url,
            message: error instanceof Error ? error.message : String(error),
          });
          response.destroy(error);
        });

        upstreamResponse.pipe(response);
      },
    );

    upstreamRequest.on("error", (error) => {
      log("upstream error", {
        method: request.method,
        url: request.url,
        message: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "text/plain" });
        response.end("Cloudflare Access proxy upstream error");
      } else {
        response.destroy(error);
      }
    });

    request.pipe(upstreamRequest);
  } catch (error) {
    log("upstream error", {
      method: request.method,
      url: request.url,
      message: error instanceof Error ? error.message : String(error),
    });
    response.writeHead(502, { "content-type": "text/plain" });
    response.end("Cloudflare Access proxy upstream error");
  }
});

server.listen(port, host, () => {
  log("listening", { host, port, target: target.toString() });
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
