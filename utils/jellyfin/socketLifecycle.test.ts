import { SocketLifecycle } from "./socketLifecycle";

const setup = (readyState = 1) => {
  let appState = "active";
  const lifecycle = new SocketLifecycle(() => appState);
  const socket = {
    readyState,
    send: jest.fn(),
    close: jest.fn(() => {
      socket.readyState = 3;
    }),
  };
  lifecycle.setSocket(socket);
  const transition = (state: string) => {
    appState = state;
    return lifecycle.onAppState(state);
  };
  return { lifecycle, socket, transition };
};

test.each([0, 1])(
  "inactive then active preserves a %s socket and group membership",
  (state) => {
    const { lifecycle, socket, transition } = setup(state);
    expect(transition("inactive")).toBe(false);
    expect(transition("active")).toBe(false);
    expect(lifecycle.canConnect()).toBe(false);
    expect(socket.close).not.toHaveBeenCalled();
  },
);

test("native playback holds its socket until the last background lease is released", () => {
  const { lifecycle, socket, transition } = setup();
  const releaseNative = lifecycle.retainInBackground();
  const releaseOther = lifecycle.retainInBackground();
  expect(transition("background")).toBe(false);
  expect(socket.close).not.toHaveBeenCalled();
  releaseNative();
  releaseNative();
  expect(socket.close).not.toHaveBeenCalled();
  releaseOther();
  releaseOther();
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(lifecycle.canConnect()).toBe(false);
});

test("foreground lease release preserves the socket; ordinary backgrounding closes it", () => {
  const { lifecycle, socket, transition } = setup();
  lifecycle.retainInBackground()();
  expect(socket.close).not.toHaveBeenCalled();
  transition("background");
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(lifecycle.canConnect()).toBe(false);
  expect(transition("active")).toBe(true);
  expect(lifecycle.canConnect()).toBe(true);
});

test("retained PiP can reconnect after a real socket failure in background", () => {
  const { lifecycle, socket, transition } = setup();
  lifecycle.retainInBackground();
  transition("background");
  socket.readyState = 3;
  expect(lifecycle.canConnect()).toBe(true);
  const replacement = { readyState: 0, send: jest.fn(), close: jest.fn() };
  lifecycle.setSocket(replacement);
  expect(lifecycle.canConnect()).toBe(false);
  expect(transition("active")).toBe(false);
  expect(replacement.close).not.toHaveBeenCalled();
});

test("late close/error/messages from a replaced socket cannot affect its successor", () => {
  const { lifecycle, socket } = setup();
  const replacement = { readyState: 1, send: jest.fn(), close: jest.fn() };
  lifecycle.setSocket(replacement);
  expect(lifecycle.isCurrent(socket)).toBe(false);
  expect(lifecycle.isCurrent(replacement)).toBe(true);
  expect(lifecycle.canConnect()).toBe(false);
});

test("session or network teardown closes retained playback's socket", () => {
  const { lifecycle, socket, transition } = setup();
  const release = lifecycle.retainInBackground();
  transition("background");
  lifecycle.close();
  release();
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(lifecycle.canConnect()).toBe(false);
});

describe("server keepalive and reconnects", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("ForceKeepAlive is answered immediately without advancing suspended timers", () => {
    const { lifecycle, socket } = setup();
    const interval = setInterval(() => lifecycle.sendKeepAlive(socket), 30000);
    expect(socket.send).not.toHaveBeenCalled();
    expect(lifecycle.respondToKeepAlive(socket, "ForceKeepAlive")).toBe(true);
    expect(socket.send).toHaveBeenCalledWith('{"MessageType":"KeepAlive"}');
    expect(socket.send).toHaveBeenCalledTimes(1);
    expect(lifecycle.respondToKeepAlive(socket, "SyncPlayCommand")).toBe(false);
    expect(socket.send).toHaveBeenCalledTimes(1);
    clearInterval(interval);
  });

  test("a replaced socket cannot send a forced or periodic heartbeat", () => {
    const { lifecycle, socket } = setup();
    const replacement = { readyState: 1, send: jest.fn(), close: jest.fn() };
    lifecycle.setSocket(replacement);
    expect(lifecycle.respondToKeepAlive(socket, "ForceKeepAlive")).toBe(false);
    expect(lifecycle.sendKeepAlive(socket)).toBe(false);
    expect(socket.send).not.toHaveBeenCalled();
    expect(lifecycle.respondToKeepAlive(replacement, "ForceKeepAlive")).toBe(
      true,
    );
    expect(replacement.send).toHaveBeenCalledTimes(1);
  });

  test.each([0, 2, 3])(
    "ForceKeepAlive never writes to socket state %s",
    (state) => {
      const { lifecycle, socket } = setup(state);
      expect(lifecycle.respondToKeepAlive(socket, "ForceKeepAlive")).toBe(
        false,
      );
      expect(socket.send).not.toHaveBeenCalled();
    },
  );

  test("a write failure does not throw out of the incoming message handler", () => {
    const { lifecycle, socket } = setup();
    socket.send.mockImplementation(() => {
      throw new Error("socket closed during send");
    });
    expect(lifecycle.respondToKeepAlive(socket, "ForceKeepAlive")).toBe(false);
  });

  test("error then close schedules one retry without moving its deadline", () => {
    const { lifecycle, socket } = setup(0);
    const reconnect = jest.fn();
    expect(lifecycle.scheduleReconnect(socket, 10000, reconnect)).toBe(true);
    jest.advanceTimersByTime(5000);
    socket.readyState = 3;
    expect(lifecycle.scheduleReconnect(socket, 10000, reconnect)).toBe(false);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(4999);
    expect(reconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(lifecycle.hasPendingReconnect()).toBe(false);
  });

  test("a close without an error can reconnect retained PiP in background", () => {
    const { lifecycle, socket, transition } = setup();
    lifecycle.retainInBackground();
    transition("background");
    socket.readyState = 3;
    const reconnect = jest.fn();
    expect(lifecycle.scheduleReconnect(socket, 10000, reconnect)).toBe(true);
    jest.advanceTimersByTime(10000);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  test("intentional close invalidates callbacks before synchronous close and reports disconnected", () => {
    let connected = true;
    const lifecycle = new SocketLifecycle(
      () => "active",
      () => {
        connected = false;
      },
    );
    const reconnect = jest.fn();
    const socket = {
      readyState: 1,
      send: jest.fn(),
      close: jest.fn(() => {
        socket.readyState = 3;
        expect(connected).toBe(false);
        expect(lifecycle.isCurrent(socket)).toBe(false);
        expect(lifecycle.scheduleReconnect(socket, 10000, reconnect)).toBe(
          false,
        );
      }),
    };
    lifecycle.setSocket(socket);
    lifecycle.scheduleReconnect(socket, 10000, reconnect);
    lifecycle.close();
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(10000);
    expect(reconnect).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(lifecycle.canConnect()).toBe(true);
    const replacement = { readyState: 1, send: jest.fn(), close: jest.fn() };
    lifecycle.setSocket(replacement);
    connected = true;
    lifecycle.closeSocket(socket);
    expect(connected).toBe(true);
    expect(lifecycle.isCurrent(replacement)).toBe(true);
  });

  test("last background lease release cancels retries and reports disconnection", () => {
    const onDisconnect = jest.fn();
    const lifecycle = new SocketLifecycle(() => "background", onDisconnect);
    const socket = { readyState: 3, send: jest.fn(), close: jest.fn() };
    lifecycle.setSocket(socket);
    const release = lifecycle.retainInBackground();
    const reconnect = jest.fn();
    lifecycle.scheduleReconnect(socket, 10000, reconnect);
    release();
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(lifecycle.isCurrent(socket)).toBe(false);
    jest.advanceTimersByTime(10000);
    expect(reconnect).not.toHaveBeenCalled();
  });

  test("a replacement connection cancels its predecessor's pending retry", () => {
    const { lifecycle, socket } = setup(3);
    const reconnect = jest.fn();
    lifecycle.scheduleReconnect(socket, 10000, reconnect);
    const replacement = { readyState: 0, send: jest.fn(), close: jest.fn() };
    lifecycle.setSocket(replacement);
    jest.advanceTimersByTime(10000);
    expect(reconnect).not.toHaveBeenCalled();
    expect(lifecycle.isCurrent(replacement)).toBe(true);
  });
});
