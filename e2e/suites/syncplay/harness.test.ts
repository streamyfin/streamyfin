import { Jellyfin } from "@jellyfin/sdk";
import axios, { type InternalAxiosRequestConfig } from "axios";
import {
  assertDistinctMovies,
  cleanUp,
  harnessAxios,
  interruptHandler,
  REQUEST_TIMEOUT_MS,
  type SignedInClient,
  serverWork,
  signIn,
  syncPlayEndpoint,
} from "./harness";

const SERVER = "http://127.0.0.1:18096";

interface Sent {
  method: string;
  path: string;
  token: string | undefined;
}

/**
 * The real SDK on an axios instance that answers without a network and keeps
 * what was sent; `fails` picks the requests the server refuses, `answers` the
 * body of the others.
 */
const fakeServer = (
  fails: (request: Sent) => boolean = () => false,
  answers: (request: Sent) => unknown = () => null,
  hangs: (request: Sent) => boolean = () => false,
) => {
  const sent: Sent[] = [];
  const instance = axios.create();
  instance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const request = {
      method: (config.method ?? "get").toUpperCase(),
      path: new URL(config.url ?? "", SERVER).pathname,
      token: /Token="([^"]*)"/.exec(String(config.headers.Authorization))?.[1],
    };
    sent.push(request);
    if (hangs(request)) return new Promise<never>(() => {});
    if (fails(request)) throw new Error("Request failed with status code 500");
    return {
      data: answers(request),
      status: 200,
      statusText: "",
      headers: {},
      config,
    };
  };
  const api = (name: string, token: string | undefined) =>
    new Jellyfin({
      clientInfo: {
        name: "Streamyfin SyncPlay protocol tests",
        version: "1.0",
      },
      deviceInfo: { name, id: `streamyfin-protocol-run-${name}` },
    }).createApi(SERVER, token, instance);
  const signedIn = (name: string) => ({
    name,
    api: api(name, `${name}-token`),
  });
  return { sent, signedIn, signedOut: (name: string) => api(name, undefined) };
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

  test("goes on past a server that never answers", async () => {
    // A server that takes the connection and never answers held the cleanup
    // on its first sign-out: nothing after it ran, and the run never ended.
    const server = fakeServer(
      () => false,
      () => null,
      (request) => request.token === "guest-token",
    );
    const host = server.signedIn("host");
    const guest = server.signedIn("guest");

    const failures = await cleanUp(
      [guest, host],
      host.api,
      "temporary-user",
      20,
    );

    expect(failures).toEqual(["sign out guest: no answer after 20 ms"]);
    expect(
      server.sent.map(({ method, token }) => `${method} ${token}`),
    ).toEqual(["POST guest-token", "DELETE host-token", "POST host-token"]);
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

describe("serverWork", () => {
  test("lets the cleanup see what was still being created when it started", async () => {
    // Ctrl-C while the restricted account was being created: the cleanup read
    // its id before the server answered, and the account outlived the run.
    const work = serverWork();
    let temporaryUserId: string | undefined;
    let answer = () => {};
    const created = work.track(async () => {
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      temporaryUserId = "temporary-user";
    });

    const settled = work.settle().then(() => temporaryUserId);
    answer();

    await expect(settled).resolves.toBe("temporary-user");
    await created;
  });

  test("refuses new work once the cleanup has started", async () => {
    const work = serverWork();
    await work.settle();
    const started = jest.fn(async () => {});

    await expect(work.track(started)).rejects.toThrow("cleaning up");
    expect(started).not.toHaveBeenCalled();
  });

  test("settles past work that failed", async () => {
    const work = serverWork();
    const failed = work.track(async () => {
      throw new Error("refused");
    });

    await expect(work.settle()).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow("refused");
  });
});

describe("harnessAxios", () => {
  test("gives every request a deadline", () => {
    // Axios waits for ever by default (timeout 0).
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(harnessAxios().defaults.timeout).toBe(REQUEST_TIMEOUT_MS);
  });
});

describe("signIn", () => {
  test("hands the client to the cleanup before its capabilities are posted", async () => {
    // A failed capabilities post left the client out of the cleanup: its token, an
    // administrator's for the host, stayed valid on the bench server.
    const server = fakeServer(
      (request) => request.path === "/Sessions/Capabilities/Full",
      (request) =>
        request.path === "/Users/AuthenticateByName"
          ? { AccessToken: "host-token" }
          : null,
    );
    const signedIn: SignedInClient[] = [];

    await expect(
      signIn(
        "host",
        server.signedOut("host"),
        { name: "test", password: "p1" },
        signedIn,
      ),
    ).rejects.toThrow("status code 500");
    await cleanUp(signedIn, undefined, undefined);

    expect(signedIn.map((client) => client.name)).toEqual(["host"]);
    expect(server.sent.at(-1)).toEqual({
      method: "POST",
      path: "/Sessions/Logout",
      token: "host-token",
    });
  });
});

describe("assertDistinctMovies", () => {
  test("refuses two codes that tag the same movie", () => {
    // The next and previous waits match on the item id: a movie listed twice let them
    // pass before playback moved.
    const clip = (id: string, name: string) => ({ id, name });
    expect(() =>
      assertDistinctMovies(
        [clip("m1", "Clip 1"), clip("m2", "Clip 2"), clip("m1", "Clip 1")],
        ["V01", "V03", "V06"],
      ),
    ).toThrow("V01 and V06 tag the same movie, Clip 1");
    expect(() =>
      assertDistinctMovies(
        [clip("m1", "Clip 1"), clip("m2", "Clip 2")],
        ["V01", "V03"],
      ),
    ).not.toThrow();
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

  test("reports what the cleanup left behind before exiting", async () => {
    // The failures were dropped on Ctrl-C: a token or the restricted account left on the
    // server went unsaid.
    const written: string[] = [];
    const stderr = jest
      .spyOn(process.stderr, "write")
      .mockImplementation((chunk) => {
        written.push(String(chunk));
        return true;
      });
    const exited = new Promise<number>((resolve) => {
      interruptHandler(
        async () => ["sign out guest: Request failed with status code 500"],
        resolve,
      )();
    });

    expect(await exited).toBe(130);
    expect(written).toContain(
      "FAIL cleanup sign out guest: Request failed with status code 500\n",
    );
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
