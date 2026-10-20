import { act, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { useEffect, useState } from "react";
import { AppState, Text } from "react-native";
import { measureRenders } from "reassure";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  useWebSocketContext,
  WebSocketProvider,
} from "@/providers/WebSocketProvider";
import { QueryWrapper } from "@/test-utils/queryWrapper";

// The device id comes from native randomness, which Jest has none of.
jest.mock("expo-crypto", () => ({ randomUUID: () => "test-device" }));
jest.mock(
  "@/providers/NetworkStatusProvider",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);

const CONSUMERS = 20;
const MESSAGES = 30;

class TestSocket {
  static latest: TestSocket;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = () => {};
  close = () => {};

  constructor(readonly url: string) {
    TestSocket.latest = this;
  }
}

// What a screen that listens for one kind of message looks like: it reads
// the socket from the context and subscribes, and shows what it got.
const Listener = ({ index }: { index: number }) => {
  const { subscribe } = useWebSocketContext();
  const [count, setCount] = useState(0);
  useEffect(
    () => subscribe("Sessions", () => setCount((current) => current + 1)),
    [subscribe],
  );
  return <Text>{`Listener ${index}: ${count}`}</Text>;
};

const originalWebSocket = globalThis.WebSocket;

describe("WebSocketProvider Performance", () => {
  beforeEach(() => {
    Object.assign(getDefaultStore().get(apiAtom) as object, {
      basePath: "https://jellyfin.example.com",
      accessToken: "test-token",
    });
    Object.defineProperty(AppState, "currentState", {
      value: "active",
      configurable: true,
    });
    globalThis.WebSocket = TestSocket as unknown as typeof WebSocket;
  });
  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  test("socket messages re-render every consumer of the context", async () => {
    await measureRenders(
      <WebSocketProvider>
        {Array.from({ length: CONSUMERS }, (_, index) => (
          <Listener key={index} index={index} />
        ))}
      </WebSocketProvider>,
      {
        wrapper: QueryWrapper,
        scenario: async () => {
          await screen.findByText("Listener 0: 0");
          await act(async () => {
            TestSocket.latest.readyState = 1;
            TestSocket.latest.onopen?.();
          });
          for (let i = 0; i < MESSAGES; i++) {
            await act(async () => {
              TestSocket.latest.onmessage?.({
                data: JSON.stringify({
                  MessageType: i % 2 ? "Sessions" : "KeepAlive",
                  Data: [],
                }),
              });
            });
          }
          await screen.findByText(`Listener 0: ${MESSAGES / 2}`);
        },
      },
    );
  });
});
