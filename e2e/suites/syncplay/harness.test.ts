import { Jellyfin } from "@jellyfin/sdk";
import axios, { type InternalAxiosRequestConfig } from "axios";
import { cleanUp, interruptHandler, syncPlayEndpoint } from "./harness";

const SERVER = "http://127.0.0.1:18096";

interface Sent {
  method: string;
  path: string;
  token: string | undefined;
}

/**
 * The real SDK on an axios instance that answers without a network and keeps
 * what was sent; `fails` picks the requests the server refuses.
 */
const fakeServer = (fails: (request: Sent) => boolean = () => false) => {
  const sent: Sent[] = [];
  const instance = axios.create();
  instance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const request = {
      method: (config.method ?? "get").toUpperCase(),
      path: new URL(config.url ?? "", SERVER).pathname,
      token: /Token="([^"]*)"/.exec(String(config.headers.Authorization))?.[1],
    };
    sent.push(request);
    if (fails(request)) throw new Error("Request failed with status code 500");
    return { data: null, status: 204, statusText: "", headers: {}, config };
  };
  const signedIn = (name: string) => ({
    name,
    api: new Jellyfin({
      clientInfo: {
        name: "Streamyfin SyncPlay protocol tests",
        version: "1.0",
      },
      deviceInfo: { name, id: `streamyfin-protocol-run-${name}` },
    }).createApi(SERVER, `${name}-token`, instance),
  });
  return { sent, signedIn };
};

describe("cleanUp", () => {
  test("signs every client out and the administrator last, after deleting the restricted account", async () => {
    // Each client signs in under its own device id: without a sign-out, its token, an
    // administrator's for the host, stayed valid on the shared server after the run.
    const server = fakeServer();
    const host = server.signedIn("host");
    const guest = server.signedIn("guest");
    const restricted = server.signedIn("restricted");

    const failures = await cleanUp(
      [host, guest, restricted],
      host.api,
      "temporary-user",
    );

    expect(failures).toEqual([]);
    expect(server.sent).toEqual([
      { method: "POST", path: "/Sessions/Logout", token: "guest-token" },
      { method: "POST", path: "/Sessions/Logout", token: "restricted-token" },
      { method: "DELETE", path: "/Users/temporary-user", token: "host-token" },
      { method: "POST", path: "/Sessions/Logout", token: "host-token" },
    ]);
  });

  test("goes on after a refusal and reports what is left behind", async () => {
    const server = fakeServer(
      (request) =>
        request.method === "DELETE" || request.token === "guest-token",
    );
    const host = server.signedIn("host");
    const guest = server.signedIn("guest");

    const failures = await cleanUp([host, guest], host.api, "temporary-user");

    expect(failures).toEqual([
      "sign out guest: Request failed with status code 500",
      "delete the restricted account temporary-user: Request failed with status code 500",
    ]);
    expect(
      server.sent.filter((request) => request.path === "/Sessions/Logout"),
    ).toHaveLength(2);
  });

  test("deletes nothing when no restricted account was created", async () => {
    const server = fakeServer();
    const host = server.signedIn("host");

    await cleanUp([host], host.api, undefined);

    expect(server.sent).toEqual([
      { method: "POST", path: "/Sessions/Logout", token: "host-token" },
    ]);
  });
});

describe("interruptHandler", () => {
  test("cleans up before exiting as SIGINT would", async () => {
    // Bun leaves on Ctrl-C without running finally blocks, so the handler does the cleanup.
    const steps: string[] = [];
    let finish = () => {};
    const cleanedUp = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const stderr = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const onInterrupt = interruptHandler(
      async () => {
        steps.push("cleanup started");
        await cleanedUp;
        steps.push("cleanup done");
      },
      (code) => steps.push(`exit ${code}`),
    );

    onInterrupt();
    await Promise.resolve();
    expect(steps).toEqual(["cleanup started"]);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(steps).toEqual(["cleanup started", "cleanup done", "exit 130"]);
    stderr.mockRestore();
  });
});

describe("syncPlayEndpoint", () => {
  test("names the endpoint of a server at the root", () => {
    expect(syncPlayEndpoint(`${SERVER}/SyncPlay/New`, SERVER)).toBe(
      "/SyncPlay/New",
    );
    expect(
      syncPlayEndpoint(
        `${SERVER}/SyncPlay/0f8fad5b-d9cb-469f-a165-70867728950e`,
        SERVER,
      ),
    ).toBe("/SyncPlay/{id}");
    expect(syncPlayEndpoint(`${SERVER}/Sessions/Logout`, SERVER)).toBeNull();
  });

  test("strips the path of a server behind a sub-path", () => {
    // Every request went to /jellyfin/SyncPlay/..., none counted, and the coverage step
    // reported all 22 endpoints as uncovered.
    const server = "https://jellyfin-13.example.test/jellyfin";
    expect(
      syncPlayEndpoint(
        "https://jellyfin-13.example.test/jellyfin/SyncPlay/New",
        server,
      ),
    ).toBe("/SyncPlay/New");
    expect(
      syncPlayEndpoint(
        "https://jellyfin-13.example.test/jellyfin/SyncPlay/0f8fad5b-d9cb-469f-a165-70867728950e",
        `${server}/`,
      ),
    ).toBe("/SyncPlay/{id}");
    expect(
      syncPlayEndpoint(
        "https://jellyfin-13.example.test/jellyfin/Users/Me",
        server,
      ),
    ).toBeNull();
  });
});
