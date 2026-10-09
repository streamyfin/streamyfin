import type { Api } from "@jellyfin/sdk";
import { act, renderHook } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { NOTIFICATION_CAPABILITIES } from "@/constants/Notifications";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { setJellyfinHeaders } from "@/test-utils/customHeaders";
import { customHeadersVersionAtom } from "@/utils/customHeaders";
import { writeErrorLog } from "@/utils/log";
import { usePushRegistration } from "./usePushRegistration";

let mockPrimaryUrl: string | null = null;

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(null),
    userAtom: atom(null),
    getServerUrlFromStorage: () => mockPrimaryUrl,
  };
});
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
jest.mock("@/utils/device", () => ({ getOrSetDeviceId: () => "device-1" }));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));

const REMOTE_URL = "https://jellyfin.example.com";
const LAN_URL = "http://192.168.1.10:8096";
const GATEWAY_HEADERS = { "CF-Access-Client-Id": "client-id" };

/** A registration the hook sent, which lands when the test answers it. */
interface Request {
  path: string;
  body: Record<string, unknown>;
  answered: boolean;
  answer: (ok?: boolean) => void;
}

let requests: Request[] = [];
// What the plugin holds for the device: the last registration that landed.
let held: Record<string, unknown> | undefined;

/** An api at `basePath` whose posts wait until the test answers them. */
const apiAt = (basePath: string) =>
  ({
    basePath,
    post: (path: string, body: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        const request: Request = {
          path,
          body,
          answered: false,
          answer: (ok = true) => {
            request.answered = true;
            if (!ok) return reject(new Error("refused"));
            held = body;
            resolve({ status: 200 });
          },
        };
        requests.push(request);
      }),
  }) as unknown as Api;

let store: ReturnType<typeof createStore>;

const signIn = (api = apiAt(REMOTE_URL)) => {
  store.set(apiAtom, api);
  store.set(userAtom, { Id: "user-1" });
};

interface Props {
  token?: string;
  language: string;
}

const renderRegistration = (
  initialProps: Props = { token: "token-1", language: "en" },
) =>
  renderHook(
    ({ token, language }: Props) => usePushRegistration(token, language),
    {
      initialProps,
      wrapper: ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={store}>{children}</JotaiProvider>
      ),
    },
  );

/** Lets whatever an answered request set off run to its end. */
const settle = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

const waiting = () => requests.filter((request) => !request.answered);

/**
 * Answers every request still waiting, the newest first, and whatever those
 * answers send in turn: the order that leaves the plugin with the older of
 * two registrations in flight.
 */
const answerNewestFirst = async () => {
  for (let next = waiting().at(-1); next; next = waiting().at(-1)) {
    next.answer();
    await settle();
  }
};

describe("usePushRegistration", () => {
  beforeEach(() => {
    requests = [];
    held = undefined;
    mockPrimaryUrl = REMOTE_URL;
    setJellyfinHeaders();
    store = createStore();
    signIn();
    jest.mocked(writeErrorLog).mockClear();
  });

  test("registers the token, the device, the user, the app's language and what it can show", async () => {
    await renderRegistration();

    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/Streamyfin/device");
    expect(requests[0].body).toEqual({
      token: "token-1",
      deviceId: "device-1",
      userId: "user-1",
      language: "en",
      serverUrl: REMOTE_URL,
      capabilities: NOTIFICATION_CAPABILITIES,
    });
  });

  test("waits for a push token", async () => {
    const { rerender } = await renderRegistration({
      token: undefined,
      language: "en",
    });
    expect(requests).toHaveLength(0);

    await rerender({ token: "token-1", language: "en" });
    expect(requests).toHaveLength(1);
  });

  // The registration read the language from the module-level i18n, and ran
  // again only on a new api, token or user: a device kept getting its
  // notifications in the old language until the next sign in.
  test("posts again in the new language when the app's language changes", async () => {
    const { rerender } = await renderRegistration();
    requests[0].answer();
    await settle();

    await rerender({ token: "token-1", language: "fr" });

    expect(requests).toHaveLength(2);
    expect(requests[1].body).toMatchObject({ language: "fr" });
  });

  // Sign in hands out a new api and a new user object within a second, and
  // the plugin answered the second post of the same device with a 500.
  test("posts once for the same session, however often the api and the user change", async () => {
    await renderRegistration();

    await act(async () => signIn());
    await act(async () => signIn());

    expect(requests).toHaveLength(1);
  });

  // Sign out deletes the device on the server.
  test("posts again when the same account signs in after signing out", async () => {
    await renderRegistration();
    requests[0].answer();
    await settle();

    await act(async () => {
      store.set(apiAtom, null);
      store.set(userAtom, null);
    });
    await act(async () => signIn());

    expect(requests).toHaveLength(2);
  });

  // On the home Wi-Fi the api talks to the LAN address, and the plugin built
  // every notification's poster from the address it was sent: a phone away
  // from home could not fetch it.
  test("sends the server's primary address while the app talks to its LAN one", async () => {
    signIn(apiAt(LAN_URL));

    await renderRegistration();

    expect(requests[0].body).toMatchObject({ serverUrl: REMOTE_URL });
  });

  test("does not post again when the app moves between the LAN and the remote address", async () => {
    await renderRegistration();
    requests[0].answer();
    await settle();

    await act(async () => store.set(apiAtom, apiAt(LAN_URL)));
    await act(async () => store.set(apiAtom, apiAt(REMOTE_URL)));

    expect(requests).toHaveLength(1);
  });

  // The address now comes from storage rather than from the api, so a missing
  // api has to keep meaning no session, or its key would count as sent.
  test("posts once an api arrives after the user", async () => {
    store.set(apiAtom, null);
    await renderRegistration();
    expect(requests).toHaveLength(0);

    await act(async () => store.set(apiAtom, apiAt(REMOTE_URL)));

    expect(requests).toHaveLength(1);
  });

  test("registers again with the new server after a switch of server", async () => {
    await renderRegistration();
    requests[0].answer();
    await settle();

    await act(async () => {
      mockPrimaryUrl = "https://other.example.com";
      signIn(apiAt("https://other.example.com"));
    });

    expect(requests).toHaveLength(2);
    expect(requests[1].body).toMatchObject({
      serverUrl: "https://other.example.com",
    });
  });

  // The system fetches a notification's poster with none of the app's headers,
  // so a server behind a gateway that asks for some answers it with a 403.
  test("leaves the address out for a server behind custom headers", async () => {
    setJellyfinHeaders(GATEWAY_HEADERS, REMOTE_URL);

    await renderRegistration();

    expect(requests[0].body).toMatchObject({ language: "en" });
    expect(requests[0].body.serverUrl).toBeUndefined();
  });

  // On the LAN the app sends no headers, but the poster still goes to the
  // primary address, behind the gateway.
  test("leaves it out while the app talks to the LAN address too", async () => {
    setJellyfinHeaders(GATEWAY_HEADERS, REMOTE_URL);
    signIn(apiAt(LAN_URL));

    await renderRegistration();

    expect(requests[0].body.serverUrl).toBeUndefined();
  });

  test("registers again without the address once headers are set up for the server", async () => {
    await renderRegistration();
    requests[0].answer();
    await settle();

    await act(async () => {
      setJellyfinHeaders(GATEWAY_HEADERS, REMOTE_URL);
      store.set(customHeadersVersionAtom, (version) => version + 1);
    });

    expect(requests).toHaveLength(2);
    expect(requests[1].body.serverUrl).toBeUndefined();
  });

  test("posts again on the next run after a failure, and never on its own", async () => {
    await renderRegistration();
    requests[0].answer(false);
    await settle();

    expect(writeErrorLog).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(1);

    // The user object refreshed: same session, same key.
    await act(async () => store.set(userAtom, { Id: "user-1" }));

    expect(requests).toHaveLength(2);
  });

  // Two registrations in flight could land the wrong way round: the plugin kept
  // the older one while the app took the newer one as sent.
  test("waits for the post in flight, and leaves the plugin with the latest language", async () => {
    const { rerender } = await renderRegistration();
    await rerender({ token: "token-1", language: "fr" });
    await rerender({ token: "token-1", language: "de" });

    expect(requests).toHaveLength(1);

    await answerNewestFirst();

    expect(requests.map((request) => request.body.language)).toEqual([
      "en",
      "de",
    ]);
    expect(held).toMatchObject({ language: "de" });
  });

  test("sends the new server's registration once the post in flight fails", async () => {
    await renderRegistration();
    await act(async () => {
      mockPrimaryUrl = "https://other.example.com";
      signIn(apiAt("https://other.example.com"));
    });

    expect(requests).toHaveLength(1);

    requests[0].answer(false);
    await settle();
    await answerNewestFirst();

    expect(requests).toHaveLength(2);
    expect(held).toMatchObject({ serverUrl: "https://other.example.com" });
  });

  test("drops a post still waiting when the session ends", async () => {
    const { rerender } = await renderRegistration();
    await rerender({ token: "token-1", language: "fr" });
    await act(async () => {
      store.set(apiAtom, null);
      store.set(userAtom, null);
    });

    await answerNewestFirst();

    expect(requests).toHaveLength(1);
  });
});
