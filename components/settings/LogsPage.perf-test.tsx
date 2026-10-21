import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react-native";
import { type ReactNode } from "react";
import { measureRenders } from "reassure";
import LogsPage from "@/app/(auth)/(tabs)/(home)/settings/logs/page";
import { clearMmkv } from "@/test-utils/mmkv";
import { usePerfQueryClient } from "@/test-utils/queryWrapper";
import { LogProvider } from "@/utils/log";
import { storeLogEntry } from "@/utils/logStorage";

jest.mock(
  "@/providers/GlobalModalProvider",
  () => jest.requireActual("@/test-utils/appProviders").globalModalModule,
);

const STORED_ENTRIES = 200;
const POLLS = 5;

const Wrapper = ({ children }: { children: ReactNode }) => {
  const client = usePerfQueryClient();
  return (
    <QueryClientProvider client={client}>
      <LogProvider>{children}</LogProvider>
    </QueryClientProvider>
  );
};

const seedStorage = () => {
  clearMmkv();
  for (let i = 0; i < STORED_ENTRIES; i++) {
    storeLogEntry("INFO", `Stored entry ${i}`, { index: i });
  }
};

describe("Logs Performance", () => {
  test("the logs page re-renders as new entries arrive on each poll", async () => {
    await measureRenders(<LogsPage />, {
      wrapper: Wrapper,
      // Each run appends entries, so every run starts from the same log.
      beforeEach: seedStorage,
      scenario: async () => {
        await screen.findAllByText("Stored entry 0");
        for (let poll = 0; poll < POLLS; poll++) {
          storeLogEntry("ERROR", `Arrived entry ${poll}`);
          await act(async () => {
            jest.advanceTimersByTime(1000);
          });
        }
        await screen.findAllByText(`Arrived entry ${POLLS - 1}`);
      },
    });
  });
});
