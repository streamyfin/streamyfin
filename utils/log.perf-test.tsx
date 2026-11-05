import { QueryClientProvider } from "@tanstack/react-query";
import { act } from "@testing-library/react-native";
import { type ReactNode } from "react";
import { View } from "react-native";
import { measureRenders } from "reassure";
import { clearMmkv } from "@/test-utils/mmkv";
import { usePerfQueryClient } from "@/test-utils/queryWrapper";
import { LogProvider } from "@/utils/log";
import { storeLogEntry } from "@/utils/logStorage";

const SECONDS = 10;

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={usePerfQueryClient()}>
    {children}
  </QueryClientProvider>
);

describe("LogProvider Performance", () => {
  // LogProvider sits in the root layout for the whole session and polled the
  // log once a second, which re-rendered it and made the persister rewrite the
  // query cache. With no useLog() consumer mounted it must stay idle, so the
  // commit count must not grow with elapsed time. A new entry lands every
  // second so that a poll has something to change.
  test("an idle provider does not re-render as time passes", async () => {
    await measureRenders(
      <LogProvider>
        <View />
      </LogProvider>,
      {
        wrapper: Wrapper,
        beforeEach: clearMmkv,
        scenario: async () => {
          for (let second = 0; second < SECONDS; second++) {
            storeLogEntry("INFO", `Entry ${second}`);
            await act(async () => {
              await jest.advanceTimersByTimeAsync(1000);
            });
          }
        },
      },
    );
  });
});
