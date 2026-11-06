import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { queryDehydrateOptions } from "./queryPersistence";

// The real log is under test, not the silent double `test-utils/unitSetup.ts` installs.
jest.unmock("@/utils/log");
jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => undefined | (() => void)) =>
    require("react").useEffect(cb, [cb]),
}));
jest.mock("@sentry/react-native", () => ({ addBreadcrumb: () => {} }));
jest.mock("./logStorage", () => ({
  readFromLog: jest.fn(() => []),
  storeLogEntry: jest.fn(),
}));

import { LogProvider, useLog } from "./log";
import { readFromLog } from "./logStorage";

const mockReadFromLog = readFromLog as jest.Mock;

let latest: ReturnType<typeof useLog> | undefined;
const Consumer = () => {
  latest = useLog();
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
    <LogProvider>{children}</LogProvider>
  </QueryClientProvider>
);

const tick = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

describe("useLog", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReadFromLog.mockReset();
    mockReadFromLog.mockReturnValue([]);
    latest = undefined;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // The poll used to run for the whole session, and every refetch made the
  // persister write the whole query cache to MMKV.
  it("never reads the log while no consumer is mounted", async () => {
    await render(<Tree client={new QueryClient()} />);

    await tick(10_000);

    expect(mockReadFromLog).not.toHaveBeenCalled();
  });

  it("reads the log every second while a consumer is mounted", async () => {
    await render(
      <Tree client={new QueryClient()}>
        <Consumer />
      </Tree>,
    );
    await tick(0);
    mockReadFromLog.mockClear();
    mockReadFromLog.mockReturnValue([{ message: "late" }]);

    await tick(3000);

    expect(mockReadFromLog).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(latest?.logs).toEqual([{ message: "late" }]));
  });

  it("stops reading once the last consumer unmounts", async () => {
    const client = new QueryClient();
    const view = await render(
      <Tree client={client}>
        <Consumer />
      </Tree>,
    );
    await tick(0);
    await view.rerender(<Tree client={client} />);
    await tick(0);
    mockReadFromLog.mockClear();

    await tick(10_000);

    expect(mockReadFromLog).not.toHaveBeenCalled();
  });

  it("refreshes the logs when a consumer mounts again", async () => {
    const client = new QueryClient();
    const view = await render(
      <Tree client={client}>
        <Consumer />
      </Tree>,
    );
    await tick(0);
    await view.rerender(<Tree client={client} />);
    await tick(5000);
    mockReadFromLog.mockReturnValue([{ message: "while away" }]);

    await view.rerender(
      <Tree client={client}>
        <Consumer />
      </Tree>,
    );
    await tick(0);

    await waitFor(() =>
      expect(latest?.logs).toEqual([{ message: "while away" }]),
    );
  });

  it("keeps the logs query out of the persisted cache", async () => {
    const client = new QueryClient();
    await render(
      <Tree client={client}>
        <Consumer />
      </Tree>,
    );
    await tick(0);

    const query = client.getQueryCache().find({ queryKey: ["logs"] });

    expect(query?.state.status).toBe("success");
    // The persisted-families allowlist would reject it too, so the gcTime rule
    // is checked on its own.
    expect(query?.options.gcTime).toBe(0);
    expect(queryDehydrateOptions.shouldDehydrateQuery?.(query as never)).toBe(
      false,
    );
  });
});
