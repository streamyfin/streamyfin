import { persistQueryClientSubscribe } from "@tanstack/query-persist-client-core";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import { act, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import {
  queryDehydrateOptions,
  withoutRedundantSaves,
} from "./queryPersistence";

// The real log is under test, not the silent double `test-utils/unitSetup.ts` installs.
jest.unmock("@/utils/log");
jest.mock("@sentry/react-native", () => ({ addBreadcrumb: () => {} }));
jest.mock("./logStorage", () => ({
  readFromLog: jest.fn(() => []),
  storeLogEntry: jest.fn(),
}));

import { LogProvider } from "./log";

// The persister saves the whole dehydrated cache on every cache event, so
// each cache event is a full rewrite into MMKV. A query with a `refetchInterval`
// emits events on every tick even when its data never changes, and
// `LogProvider` did exactly that for the whole session. This pins that an app
// at rest writes nothing, using the real subscription and the real dehydrate
// options with a persister that only counts. The polling control proves the
// counter can see the failure. See
// `.claude/learned-facts/polling-query-rewrites-persisted-cache.md`.

const REPRESENTATIVE_KEYS: string[][] = [
  ["home", "continue-watching"],
  ["home", "next-up"],
  ["user-views"],
  ["library", "movies"],
  ["music-latest"],
];

const RestingQuery = ({ queryKey }: { queryKey: string[] }) => {
  useQuery({ queryKey, queryFn: async () => ({ key: queryKey }) });
  return null;
};

const PollingQuery = () => {
  useQuery({
    queryKey: ["home", "polling"],
    queryFn: async () => ({ polled: true }),
    refetchInterval: 1000,
  });
  return null;
};

const Tree = ({
  client,
  children,
}: {
  client: QueryClient;
  children?: ReactNode;
}) => (
  <QueryClientProvider client={client}>
    <LogProvider>
      {REPRESENTATIVE_KEYS.map((queryKey) => (
        <RestingQuery key={queryKey.join("/")} queryKey={queryKey} />
      ))}
      {children}
    </LogProvider>
  </QueryClientProvider>
);

const tick = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

describe("persisted query cache at rest", () => {
  let writes: number;
  let unsubscribe: () => void;
  let client: QueryClient;
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    writes = 0;
    client = new QueryClient();
    const persister: Persister = {
      persistClient: () => {
        writes += 1;
      },
      restoreClient: async () => undefined,
      removeClient: async () => undefined,
    };
    unsubscribe = persistQueryClientSubscribe({
      queryClient: client,
      persister,
      dehydrateOptions: queryDehydrateOptions,
    });
  });

  afterEach(() => {
    view?.unmount();
    view = undefined;
    unsubscribe();
    client.clear();
    jest.useRealTimers();
  });

  it("writes nothing while settled queries and an unread LogProvider sit idle", async () => {
    view = await render(<Tree client={client} />);
    await tick(5_000);
    for (const queryKey of REPRESENTATIVE_KEYS) {
      expect(client.getQueryState(queryKey)?.status).toBe("success");
    }
    const settled = writes;
    expect(settled).toBeGreaterThan(0);

    await tick(60_000);

    expect(writes).toBe(settled);
  });

  it("writes on every tick of a query with a refetchInterval", async () => {
    view = await render(
      <Tree client={client}>
        <PollingQuery />
      </Tree>,
    );
    await tick(5_000);
    const settled = writes;

    await tick(60_000);

    expect(writes - settled).toBeGreaterThanOrEqual(60);
  });
});

// The Sessions badge in the Home header polls `["sessions"]` every 5 s for an
// admin. That family is not persisted, but every refetch is a cache event, and
// each one used to rewrite the whole persisted cache.
const SessionsPoll = () => {
  useQuery({
    queryKey: ["sessions"],
    queryFn: async () => [],
    refetchInterval: 5_000,
  });
  return null;
};

describe("saves of the persisted cache", () => {
  let writes: number;
  let unsubscribe: () => void;
  let client: QueryClient;
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    writes = 0;
    client = new QueryClient();
    unsubscribe = persistQueryClientSubscribe({
      queryClient: client,
      persister: withoutRedundantSaves({
        persistClient: () => {
          writes += 1;
        },
        restoreClient: async () => undefined,
        removeClient: async () => undefined,
      }),
      dehydrateOptions: queryDehydrateOptions,
    });
  });

  afterEach(() => {
    view?.unmount();
    view = undefined;
    unsubscribe();
    client.clear();
    jest.useRealTimers();
  });

  it("are skipped while only a query that is not persisted polls", async () => {
    view = await render(
      <Tree client={client}>
        <SessionsPoll />
      </Tree>,
    );
    await tick(5_000);
    const settled = writes;
    expect(settled).toBeGreaterThan(0);

    await tick(60_000);

    expect(writes).toBe(settled);
  });

  it("still happen on every refetch of a persisted query", async () => {
    view = await render(
      <Tree client={client}>
        <PollingQuery />
      </Tree>,
    );
    await tick(5_000);
    const settled = writes;

    await tick(60_000);

    expect(writes - settled).toBeGreaterThanOrEqual(60);
  });
});

// setQueryData stamps dataUpdatedAt with Date.now(): two writes in one
// millisecond share it, and only the update count tells them apart.
test("a second write in the same millisecond is still saved", async () => {
  const saved: unknown[] = [];
  const persister = withoutRedundantSaves({
    persistClient: (persisted) => {
      saved.push(persisted.clientState.queries[0]?.state.data);
    },
    restoreClient: async () => undefined,
    removeClient: async () => undefined,
  });
  const client = new QueryClient();
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
  const unsubscribe = persistQueryClientSubscribe({
    queryClient: client,
    persister,
    dehydrateOptions: queryDehydrateOptions,
  });
  client.setQueryData(["home", "row"], "first");
  client.setQueryData(["home", "row"], "second");
  unsubscribe();
  client.clear();
  now.mockRestore();

  expect(saved.at(-1)).toBe("second");
});
