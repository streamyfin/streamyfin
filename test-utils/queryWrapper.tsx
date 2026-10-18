import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider as JotaiProvider } from "jotai";
import { type ReactNode, useState } from "react";

/**
 * A fresh QueryClient per mount, so every Reassure run starts with a cold
 * cache, and nothing is garbage collected or retried mid measurement.
 */
export const usePerfQueryClient = () =>
  useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
        },
      }),
  )[0];

export const QueryWrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={usePerfQueryClient()}>
    {children}
  </QueryClientProvider>
);

export const JotaiQueryWrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider>
    <QueryWrapper>{children}</QueryWrapper>
  </JotaiProvider>
);
