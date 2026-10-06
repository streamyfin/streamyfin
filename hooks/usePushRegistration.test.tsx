import type { Api } from "@jellyfin/sdk";
import { act, renderHook } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { writeErrorLog } from "@/utils/log";
import { usePushRegistration } from "./usePushRegistration";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});
jest.mock("@/utils/device", () => ({ getOrSetDeviceId: () => "device-1" }));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));

const REMOTE_URL = "https://jellyfin.example.com";

/** A registration the hook sent, waiting for the test to answer it. */
interface Request {
  path: string;
  body: Record<string, unknown>;
  answer: (ok?: boolean) => void;
}

let requests: Request[] = [];

/** An api at `basePath` whose posts wait until the test answers them. */
const apiAt = (basePath: string) =>
  ({
    basePath,
    post: (path: string, body: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        requests.push({
          path,
          body,
          answer: (ok = true) =>
            ok ? resolve({ status: 200 }) : reject(new Error("refused")),
        });
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

describe("usePushRegistration", () => {
  beforeEach(() => {
    requests = [];
    store = createStore();
    signIn();
    jest.mocked(writeErrorLog).mockClear();
  });

  test("registers the token, the device, the user and the app's language", async () => {
    await renderRegistration();

    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/Streamyfin/device");
    expect(requests[0].body).toEqual({
      token: "token-1",
      deviceId: "device-1",
      userId: "user-1",
      language: "en",
      serverUrl: REMOTE_URL,
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
});
