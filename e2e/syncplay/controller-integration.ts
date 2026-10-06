/**
 * Live production-controller checks against the isolated Docker Jellyfin.
 * Run setup.py first, then: bun e2e/syncplay/controller-integration.ts
 * Simulated decoder states complement the checks on the real native players.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Api, Jellyfin } from "@jellyfin/sdk";
import { getSessionApi, getUserApi } from "@jellyfin/sdk/lib/utils/api";
import axios from "axios";
import { SyncPlayController } from "../../utils/syncplay/controller";
import { createSyncPlayTransport } from "../../utils/syncplay/transport";
import type {
  SyncPlayCommand,
  SyncPlayPlayerState,
  SyncPlaySnapshot,
} from "../../utils/syncplay/types";

const directory = import.meta.dir;
const credentials = JSON.parse(
  await readFile(join(directory, ".state/credentials.json"), "utf8"),
) as {
  url: string;
  serverVersion: string;
  password: string;
  host: { name: string };
  guest: { name: string };
  items: { id: string; name: string }[];
};
if (new URL(credentials.url).hostname !== "127.0.0.1")
  throw new Error("Local test server required");
const run = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const records: { name: string; passed: boolean; detail?: unknown }[] = [];
const eventLog: { client: string; type: string; data: unknown }[] = [];
const requests: {
  client: string;
  method: string;
  path: string;
  status: number;
  scenario: string;
}[] = [];
const endpoints = [
  "Buffering",
  "New",
  "{id}",
  "List",
  "Join",
  "Leave",
  "MovePlaylistItem",
  "NextItem",
  "Pause",
  "Ping",
  "PreviousItem",
  "Queue",
  "Ready",
  "RemoveFromPlaylist",
  "Seek",
  "SetIgnoreWait",
  "SetNewQueue",
  "SetPlaylistItem",
  "SetRepeatMode",
  "SetShuffleMode",
  "Stop",
  "Unpause",
].map((action) => `/SyncPlay/${action}`);
let scenario = "connect";
const clients: Client[] = [];
let temporaryUserId: string | undefined;
let admin: Api | undefined;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(
  predicate: () => boolean,
  message: string,
  timeout = 8000,
) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout)
      throw new Error(`${message}: timed out`);
    await sleep(25);
  }
}
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};

class Client {
  api: Api;
  controller: SyncPlayController;
  snapshot: SyncPlaySnapshot;
  socket: WebSocket | null = null;
  state: SyncPlayPlayerState = {
    itemId: null,
    positionTicks: 0,
    isPlaying: false,
    isReady: false,
    isBuffering: false,
  };
  positionAt = Date.now();
  ticker: ReturnType<typeof setInterval>;

  constructor(
    readonly name: string,
    api: Api,
  ) {
    this.api = api;
    this.controller = new SyncPlayController(
      createSyncPlayTransport(api),
      (snapshot) => {
        this.snapshot = snapshot;
      },
    );
    this.snapshot = this.controller.getSnapshot();
    this.controller.registerPlayer({
      getState: () => this.getState(),
      pause: () => {
        this.state = this.getState();
        this.state.isPlaying = false;
        this.positionAt = Date.now();
      },
      resume: () => {
        this.positionAt = Date.now();
        this.state.isPlaying = true;
      },
      seek: (ticks) => {
        this.state.positionTicks = ticks;
        this.positionAt = Date.now();
      },
      stop: () => {
        this.state.itemId = null;
        this.state.isPlaying = false;
        this.state.isReady = false;
      },
    });
    this.controller.registerLauncher(async (request) => {
      this.state = {
        itemId: request.itemId,
        positionTicks: request.startPositionTicks,
        isPlaying: false,
        isReady: true,
        isBuffering: false,
      };
      this.positionAt = Date.now();
      queueMicrotask(() => this.controller.notifyReady());
    });
    this.ticker = setInterval(() => this.controller.notifyProgress(), 100);
  }

  getState() {
    return {
      ...this.state,
      positionTicks:
        this.state.positionTicks +
        (this.state.isPlaying ? (Date.now() - this.positionAt) * 10_000 : 0),
    };
  }

  async connect() {
    const url = new URL(`${this.api.basePath}/socket`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ApiKey", this.api.accessToken);
    url.searchParams.set("deviceId", this.api.deviceInfo.id);
    this.socket = new WebSocket(url);
    this.socket.onopen = () => this.controller.setConnected(true);
    this.socket.onclose = () => this.controller.setConnected(false);
    this.socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.MessageType.startsWith("SyncPlay"))
        eventLog.push({
          client: this.name,
          type: message.MessageType,
          data: message.Data,
        });
      if (message.MessageType === "SyncPlayGroupUpdate")
        this.controller.handleGroupUpdate(message.Data);
      if (message.MessageType === "SyncPlayCommand")
        this.controller.handleCommand(message.Data);
    };
    await waitFor(
      () => this.snapshot.connected,
      `${this.name} socket connection`,
    );
  }

  dispose() {
    clearInterval(this.ticker);
    this.controller.dispose();
    this.socket?.close();
  }
}

async function client(name: string, label: string) {
  const jellyfin = new Jellyfin({
    clientInfo: { name: "Streamyfin SyncPlay protocol tests", version: "1.0" },
    deviceInfo: { name: label, id: `streamyfin-protocol-${run}-${label}` },
  });
  const api = jellyfin.createApi(credentials.url, undefined, axios.create());
  api.axiosInstance.interceptors.response.use((response) => {
    const pathname = new URL(response.config.url!, credentials.url).pathname;
    if (pathname.startsWith("/SyncPlay/")) {
      requests.push({
        client: label,
        method: response.config.method?.toUpperCase() ?? "GET",
        path: /^\/SyncPlay\/[0-9a-f-]{32,36}$/i.test(pathname)
          ? "/SyncPlay/{id}"
          : pathname,
        status: response.status,
        scenario,
      });
    }
    return response;
  });
  const response = await getUserApi(api).authenticateUserByName({
    authenticateUserByName: { Username: name, Pw: credentials.password },
  });
  api.accessToken = response.data.AccessToken ?? "";
  await getSessionApi(api).postFullCapabilities({
    clientCapabilitiesDto: {
      PlayableMediaTypes: ["Video"],
      SupportsMediaControl: true,
      SupportedCommands: ["Play"],
    },
  });
  const instance = new Client(label, api);
  clients.push(instance);
  await instance.connect();
  return instance;
}

async function step(name: string, work: () => Promise<unknown>) {
  scenario = name;
  const detail = await work();
  records.push({ name, passed: true, detail });
  process.stdout.write(`PASS ${name}\n`);
}

try {
  const host = await client(credentials.host.name, "host");
  const guest = await client(credentials.guest.name, "guest");
  admin = host.api;
  let groupId = "";
  await step("create/list/join real Jellyfin group", async () => {
    await host.controller.createGroup(`Protocol ${run}`);
    await waitFor(() => !!host.snapshot.group, "host GroupJoined");
    groupId = host.snapshot.group!.GroupId;
    await guest.controller.refreshGroups();
    check(
      guest.snapshot.groups.some((group) => group.GroupId === groupId),
      "Created group not listed",
    );
    await guest.controller.joinGroup(groupId);
    await waitFor(
      () =>
        guest.snapshot.group?.GroupId === groupId &&
        host.snapshot.group?.Participants.length === 2,
      "guest GroupJoined and participants",
    );
    return { groupId, participants: host.snapshot.group?.Participants };
  });
  await step("get single group returns server membership", async () => {
    const group = await guest.controller.getGroup(groupId);
    check(group?.GroupId === groupId, "Single group identity differs");
    check(
      group!.Participants.length === 2,
      "Single group does not contain both members",
    );
    return group;
  });
  const positions = () => ({
    host: host.getState().positionTicks,
    guest: guest.getState().positionTicks,
  });
  const synced = () =>
    Math.abs(host.getState().positionTicks - guest.getState().positionTicks) <
    5_000_000;
  await step("queue/ready/scheduled unpause in both clients", async () => {
    await host.controller.playItems(
      credentials.items.slice(0, 2).map((item) => item.id),
    );
    await waitFor(
      () => host.state.isPlaying && guest.state.isPlaying,
      "both clients playing",
    );
    check(synced(), "Initial playback positions differ");
    return positions();
  });
  await step("guest pause controls host", async () => {
    await guest.controller.requestPause();
    await waitFor(
      () => !host.state.isPlaying && !guest.state.isPlaying,
      "both paused",
    );
    check(synced(), "Paused positions differ");
    return positions();
  });
  await step(
    "guest seek while paused preserves paused group state",
    async () => {
      await guest.controller.requestSeek(200_000_000);
      await waitFor(
        () =>
          Math.abs(host.getState().positionTicks - 200_000_000) < 5_000_000 &&
          Math.abs(guest.getState().positionTicks - 200_000_000) < 5_000_000 &&
          host.snapshot.groupState === "Paused",
        "paused seek target",
      );
      check(
        !host.state.isPlaying && !guest.state.isPlaying,
        "Paused seek resumed group",
      );
      return positions();
    },
  );
  await step("host unpause controls guest", async () => {
    await host.controller.requestUnpause();
    await waitFor(
      () => host.state.isPlaying && guest.state.isPlaying,
      "both resumed",
    );
    check(synced(), "Resumed positions differ");
    return positions();
  });
  await step("host seek while playing resumes both after Ready", async () => {
    await host.controller.requestSeek(500_000_000);
    await waitFor(
      () =>
        host.state.isPlaying &&
        guest.state.isPlaying &&
        host.getState().positionTicks >= 500_000_000 &&
        guest.getState().positionTicks >= 500_000_000,
      "playing seek target",
    );
    check(synced(), "Playing seek positions differ");
    return positions();
  });
  await step("next and previous use server playlist ids", async () => {
    await guest.controller.requestNext();
    await waitFor(
      () =>
        host.state.itemId === credentials.items[1].id &&
        guest.state.itemId === credentials.items[1].id &&
        host.state.isPlaying &&
        guest.state.isPlaying,
      "next playlist item",
    );
    await host.controller.requestPrevious();
    await waitFor(
      () =>
        host.state.itemId === credentials.items[0].id &&
        guest.state.itemId === credentials.items[0].id &&
        host.state.isPlaying &&
        guest.state.isPlaying,
      "previous playlist item",
    );
    return { itemId: host.state.itemId, ...positions() };
  });
  await step(
    "stale/out-of-group/out-of-playlist commands ignored",
    async () => {
      const last = eventLog
        .filter(
          (event) =>
            event.client === "host" && event.type === "SyncPlayCommand",
        )
        .at(-1)!.data as SyncPlayCommand;
      host.controller.handleCommand({
        ...last,
        Command: "Stop",
        GroupId: "00000000-0000-0000-0000-000000000001",
      });
      host.controller.handleCommand({
        ...last,
        Command: "Stop",
        EmittedAt: new Date(0).toISOString(),
      });
      host.controller.handleCommand({
        ...last,
        Command: "Pause",
        PlaylistItemId: "00000000-0000-0000-0000-000000000001",
      });
      await sleep(150);
      check(
        host.state.isPlaying && host.state.itemId === credentials.items[0].id,
        "Stale command changed playback",
      );
    },
  );
  await step("leave and late rejoin playing group", async () => {
    await guest.controller.leaveGroup();
    check(
      guest.snapshot.group === null && guest.state.isPlaying,
      "Leave failed solo continuation",
    );
    await sleep(150);
    await guest.controller.joinGroup(groupId);
    await waitFor(
      () =>
        !!guest.snapshot.group &&
        host.state.isPlaying &&
        guest.state.isPlaying &&
        synced(),
      "late join synchronizes",
    );
    return positions();
  });
  await step("buffering pauses everyone; Ready resumes everyone", async () => {
    guest.state.isBuffering = true;
    guest.controller.notifyBuffering(true);
    await waitFor(
      () => !host.state.isPlaying,
      "host paused for guest buffering",
    );
    guest.state.isBuffering = false;
    guest.controller.notifyBuffering(false);
    await waitFor(
      () => host.state.isPlaying && guest.state.isPlaying && synced(),
      "both resumed after buffering",
    );
    return positions();
  });
  const queueIds = () => host.snapshot.playlist.map((item) => item.ItemId);
  const queuesEqual = () =>
    JSON.stringify(host.snapshot.playlist) ===
    JSON.stringify(guest.snapshot.playlist);
  const current = () => host.snapshot.currentPlaylistItemId;
  const items = credentials.items.map((item) => item.id);
  const waitPlayingItem = (id: string, message: string) =>
    waitFor(
      () =>
        host.state.itemId === id &&
        guest.state.itemId === id &&
        host.state.isPlaying &&
        guest.state.isPlaying &&
        synced(),
      message,
    );
  await step(
    "append queue preserves current playback in both clients",
    async () => {
      const before = current();
      await guest.controller.queueItems([items[2]], "Queue");
      await waitFor(
        () => queueIds().length === 3 && queuesEqual(),
        "appended shared queue",
      );
      check(
        JSON.stringify(queueIds()) === JSON.stringify(items),
        "Append did not add to end",
      );
      check(
        current() === before && host.state.isPlaying && guest.state.isPlaying,
        "Append interrupted current item",
      );
      return {
        playlist: host.snapshot.playlist,
        currentPlaylistItemId: current(),
      };
    },
  );
  await step("PlayNext inserts directly after current item", async () => {
    const before = current();
    await host.controller.queueItems([items[2]], "QueueNext");
    await waitFor(
      () => queueIds().length === 4 && queuesEqual(),
      "shared PlayNext queue",
    );
    check(
      JSON.stringify(queueIds()) ===
        JSON.stringify([items[0], items[2], items[1], items[2]]),
      "PlayNext insertion differs",
    );
    check(current() === before, "PlayNext changed current item");
    const ids = host.snapshot.playlist
      .filter((item) => item.ItemId === items[2])
      .map((item) => item.PlaylistItemId);
    check(ids[0] !== ids[1], "Duplicate media needs unique playlist ids");
    return { playlist: host.snapshot.playlist };
  });
  await step(
    "remove one duplicate by playlist id preserves the other",
    async () => {
      const remove = host.snapshot.playlist[3].PlaylistItemId;
      await guest.controller.removePlaylistItems([remove]);
      await waitFor(
        () => queueIds().length === 3 && queuesEqual(),
        "shared item removal",
      );
      check(
        JSON.stringify(queueIds()) ===
          JSON.stringify([items[0], items[2], items[1]]),
        "Removed wrong duplicate item",
      );
      check(
        !host.snapshot.playlist.some((item) => item.PlaylistItemId === remove),
        "Removed playlist id remained",
      );
      return { playlist: host.snapshot.playlist };
    },
  );
  await step(
    "reorder playlist item preserves current playback identity",
    async () => {
      const before = current();
      const move = host.snapshot.playlist[2].PlaylistItemId;
      await host.controller.movePlaylistItem(move, 1);
      await waitFor(
        () => queueIds()[1] === items[1] && queuesEqual(),
        "shared reordered queue",
      );
      check(
        JSON.stringify(queueIds()) === JSON.stringify(items),
        "Reorder differs",
      );
      check(current() === before, "Reorder changed current item");
      return {
        playlist: host.snapshot.playlist,
        currentPlaylistItemId: current(),
      };
    },
  );
  await step("select shared playlist item starts both clients", async () => {
    const select = host.snapshot.playlist[2].PlaylistItemId;
    await guest.controller.requestPlaylistItem(select);
    await waitPlayingItem(items[2], "selected queue item playing");
    check(
      current() === select && guest.snapshot.currentPlaylistItemId === select,
      "Selected playlist identity differs",
    );
    return { selected: select, ...positions() };
  });
  await step("clear upcoming queue retains current media", async () => {
    const before = current();
    await guest.controller.clearPlaylist(false);
    await waitFor(
      () => host.snapshot.playlist.length === 1 && queuesEqual(),
      "queue cleared except playing item",
    );
    check(
      current() === before &&
        host.state.itemId === items[2] &&
        guest.state.itemId === items[2],
      "Clear removed current media",
    );
    return { playlist: host.snapshot.playlist };
  });
  await step(
    "clear entire queue stops both clients and retains group",
    async () => {
      await host.controller.clearPlaylist(true);
      await waitFor(
        () =>
          !host.state.itemId &&
          !guest.state.itemId &&
          host.snapshot.playlist.length === 0 &&
          queuesEqual(),
        "all playlist items cleared",
      );
      check(
        !!host.snapshot.group && !!guest.snapshot.group,
        "Clearing queue lost membership",
      );
      return {
        playlist: host.snapshot.playlist,
        groupState: host.snapshot.groupState,
      };
    },
  );
  await step(
    "repeat modes and shuffle state synchronize to all members",
    async () => {
      await host.controller.playItems(items);
      await waitPlayingItem(items[0], "repeat test queue playing");
      await guest.controller.setRepeatMode("RepeatOne");
      await waitFor(
        () =>
          host.snapshot.repeatMode === "RepeatOne" &&
          guest.snapshot.repeatMode === "RepeatOne",
        "repeat-one shared state",
      );
      await host.controller.setRepeatMode("RepeatAll");
      await waitFor(
        () =>
          host.snapshot.repeatMode === "RepeatAll" &&
          guest.snapshot.repeatMode === "RepeatAll",
        "repeat-all shared state",
      );
      await guest.controller.setRepeatMode("RepeatNone");
      await waitFor(
        () =>
          host.snapshot.repeatMode === "RepeatNone" &&
          guest.snapshot.repeatMode === "RepeatNone",
        "repeat-off shared state",
      );
      const before = current();
      await guest.controller.setShuffleMode("Shuffle");
      await waitFor(
        () =>
          host.snapshot.shuffleMode === "Shuffle" &&
          guest.snapshot.shuffleMode === "Shuffle" &&
          queuesEqual(),
        "shared shuffle enabled",
      );
      check(current() === before, "Shuffle changed current media identity");
      check(
        [...queueIds()].sort().join() === [...items].sort().join(),
        "Shuffle lost or duplicated media",
      );
      await host.controller.setShuffleMode("Sorted");
      await waitFor(
        () =>
          host.snapshot.shuffleMode === "Sorted" &&
          guest.snapshot.shuffleMode === "Sorted" &&
          queuesEqual(),
        "shared shuffle disabled",
      );
      check(
        JSON.stringify(queueIds()) === JSON.stringify(items),
        "Sorted mode did not restore queue order",
      );
      return {
        repeatMode: host.snapshot.repeatMode,
        shuffleMode: host.snapshot.shuffleMode,
        playlist: host.snapshot.playlist,
      };
    },
  );
  const end = (member: Client) => {
    member.state = {
      ...member.getState(),
      positionTicks: 1_200_000_000,
      isPlaying: false,
    };
    member.positionAt = Date.now();
    member.controller.notifyEnded();
  };
  await step("repeat-one natural EOF restarts same playlist item", async () => {
    await host.controller.setRepeatMode("RepeatOne");
    await waitFor(
      () => guest.snapshot.repeatMode === "RepeatOne",
      "repeat-one before EOF",
    );
    const before = current();
    end(guest);
    await waitFor(
      () =>
        host.state.isPlaying &&
        guest.state.isPlaying &&
        host.getState().positionTicks < 30_000_000 &&
        guest.getState().positionTicks < 30_000_000,
      "repeat-one EOF restarted",
    );
    check(
      current() === before &&
        host.state.itemId === items[0] &&
        guest.state.itemId === items[0],
      "Repeat-one advanced media",
    );
    // A second EOF on the same playlist id verifies the deduplication marker
    // resets after the server restarts the item.
    end(guest);
    await waitFor(
      () =>
        host.state.isPlaying &&
        guest.state.isPlaying &&
        host.getState().positionTicks < 30_000_000 &&
        guest.getState().positionTicks < 30_000_000,
      "repeat-one second EOF restarted",
    );
    check(current() === before, "Second repeat-one EOF advanced media");
    return { playlistItemId: current(), ...positions() };
  });
  await step(
    "repeat-one explicit Next and Previous restart same item",
    async () => {
      const before = current();
      await host.controller.requestSeek(300_000_000);
      await waitFor(
        () =>
          host.getState().positionTicks >= 300_000_000 &&
          guest.getState().positionTicks >= 300_000_000,
        "seek before repeated Next",
      );
      await guest.controller.requestNext();
      await waitFor(
        () =>
          host.state.isPlaying &&
          guest.state.isPlaying &&
          host.getState().positionTicks < 30_000_000 &&
          guest.getState().positionTicks < 30_000_000,
        "repeat-one explicit Next restart",
      );
      await guest.controller.requestSeek(300_000_000);
      await waitFor(
        () =>
          host.getState().positionTicks >= 300_000_000 &&
          guest.getState().positionTicks >= 300_000_000,
        "seek before repeated Previous",
      );
      await host.controller.requestPrevious();
      await waitFor(
        () =>
          host.state.isPlaying &&
          guest.state.isPlaying &&
          host.getState().positionTicks < 30_000_000 &&
          guest.getState().positionTicks < 30_000_000,
        "repeat-one explicit Previous restart",
      );
      check(
        current() === before,
        "Repeat-one explicit navigation advanced media",
      );
      return { playlistItemId: current(), ...positions() };
    },
  );
  await step("repeat-all final EOF wraps to first item", async () => {
    await guest.controller.setRepeatMode("RepeatAll");
    await waitFor(
      () => host.snapshot.repeatMode === "RepeatAll",
      "repeat-all before EOF",
    );
    await host.controller.requestPlaylistItem(
      host.snapshot.playlist.at(-1)!.PlaylistItemId,
    );
    await waitPlayingItem(items[2], "last repeat-all item playing");
    end(host);
    await waitPlayingItem(items[0], "repeat-all EOF wrapped");
    check(
      host.snapshot.playingItemIndex === 0 &&
        guest.snapshot.playingItemIndex === 0,
      "Repeat-all did not wrap queue index",
    );
    return { playingItemIndex: host.snapshot.playingItemIndex, ...positions() };
  });
  await step("repeat-all explicit Previous and Next wrap queue", async () => {
    await guest.controller.requestPrevious();
    await waitPlayingItem(items[2], "repeat-all Previous wraps to last");
    await host.controller.requestNext();
    await waitPlayingItem(items[0], "repeat-all Next wraps to first");
    return { playingItemIndex: host.snapshot.playingItemIndex, ...positions() };
  });
  await step("repeat-off final EOF stops rather than wraps", async () => {
    await host.controller.setRepeatMode("RepeatNone");
    await waitFor(
      () => guest.snapshot.repeatMode === "RepeatNone",
      "repeat-off before EOF",
    );
    await guest.controller.requestPlaylistItem(
      host.snapshot.playlist.at(-1)!.PlaylistItemId,
    );
    await waitPlayingItem(items[2], "last repeat-off item playing");
    end(guest);
    await waitFor(
      () =>
        !host.state.itemId &&
        !guest.state.itemId &&
        host.snapshot.groupState === "Idle",
      "repeat-off end stopped group",
    );
    check(
      !!host.snapshot.group && !!guest.snapshot.group,
      "Natural EOF lost group membership",
    );
    return { groupState: host.snapshot.groupState };
  });
  await step(
    "ignore-wait true releases group while member remains buffering",
    async () => {
      await host.controller.playItems(items.slice(0, 2));
      await waitPlayingItem(items[0], "wait policy queue playing");
      guest.state = {
        ...guest.getState(),
        isPlaying: false,
        isBuffering: true,
      };
      guest.positionAt = Date.now();
      guest.controller.notifyBuffering(true);
      await waitFor(
        () => !host.state.isPlaying && host.snapshot.groupState === "Waiting",
        "group waiting on buffering member",
      );
      await guest.controller.setIgnoreWait(true);
      check(
        guest.snapshot.ignoreWait && !host.snapshot.ignoreWait,
        "Ignore-wait is a per-member setting",
      );
      await waitFor(
        () => host.state.isPlaying && host.snapshot.groupState === "Playing",
        "group resumes without ignored member Ready",
      );
      const before = host.getState().positionTicks;
      await sleep(300);
      check(
        host.state.isPlaying &&
          host.getState().positionTicks > before &&
          guest.state.isBuffering,
        "Group failed to continue while ignored member buffers",
      );
      guest.state.isBuffering = false;
      guest.controller.notifyBuffering(false);
      await waitFor(
        () => guest.state.isPlaying && synced(),
        "ignored member catches up after Ready",
      );
      return {
        hostIgnoreWait: host.snapshot.ignoreWait,
        guestIgnoreWait: guest.snapshot.ignoreWait,
        ...positions(),
      };
    },
  );
  await step(
    "ignore-wait false restores buffering pause and Ready barrier",
    async () => {
      await guest.controller.setIgnoreWait(false);
      check(
        !guest.snapshot.ignoreWait,
        "Ignore-wait reset did not persist locally",
      );
      guest.state = {
        ...guest.getState(),
        isPlaying: false,
        isBuffering: true,
      };
      guest.positionAt = Date.now();
      guest.controller.notifyBuffering(true);
      await waitFor(
        () => !host.state.isPlaying && host.snapshot.groupState === "Waiting",
        "group waits for restored buffering member",
      );
      guest.state.isBuffering = false;
      guest.controller.notifyBuffering(false);
      await waitFor(
        () => host.state.isPlaying && guest.state.isPlaying && synced(),
        "group resumes after restored member Ready",
      );
      return { guestIgnoreWait: guest.snapshot.ignoreWait, ...positions() };
    },
  );
  await step("group stop closes both decoders", async () => {
    await guest.controller.requestStop();
    await waitFor(
      () => !host.state.itemId && !guest.state.itemId,
      "both stopped",
    );
    check(host.snapshot.groupState === "Idle", "host group status is Idle");
    check(guest.snapshot.groupState === "Idle", "guest group status is Idle");
    check(
      !!host.snapshot.group && !!guest.snapshot.group,
      "stop retains membership",
    );
    await host.controller.refreshGroups();
    const serverState = host.snapshot.groups.find(
      (group) => group.GroupId === host.snapshot.group?.GroupId,
    )?.State;
    check(serverState === "Idle", "Jellyfin confirms idle group state");
    return { groupState: host.snapshot.groupState, serverState };
  });
  await step(
    "lobby Play after Stop restarts current entry and preserves queue",
    async () => {
      const playlistIds = host.snapshot.playlist.map(
        (entry) => entry.PlaylistItemId,
      );
      const currentPlaylistItemId = host.snapshot.currentPlaylistItemId;
      const currentItemId = host.snapshot.playlist.find(
        (entry) => entry.PlaylistItemId === currentPlaylistItemId,
      )?.ItemId;
      check(currentItemId, "Stopped group lost its current queue entry");
      await guest.controller.requestUnpause();
      await waitFor(
        () =>
          host.state.itemId === currentItemId &&
          guest.state.itemId === currentItemId &&
          host.state.isPlaying &&
          guest.state.isPlaying &&
          host.snapshot.groupState === "Playing" &&
          synced(),
        "lobby Play restarts stopped decoders",
      );
      check(
        host.snapshot.currentPlaylistItemId === currentPlaylistItemId &&
          guest.snapshot.currentPlaylistItemId === currentPlaylistItemId,
        "Lobby Play selected a different queue entry",
      );
      check(
        JSON.stringify(
          host.snapshot.playlist.map((entry) => entry.PlaylistItemId),
        ) === JSON.stringify(playlistIds),
        "Lobby Play replaced or reordered the stopped queue",
      );
      return { currentPlaylistItemId, playlistIds, ...positions() };
    },
  );
  await step("disconnect leaves group and reconnect stays solo", async () => {
    guest.socket?.close();
    await waitFor(
      () => !guest.snapshot.connected && !guest.snapshot.group,
      "disconnect cleared group",
    );
    await waitFor(
      () => host.snapshot.group?.Participants.length === 1,
      "server removed disconnected member",
    );
    await guest.connect();
    check(!guest.snapshot.group, "Reconnect rejoined stale group");
  });
  await step("missing group websocket error clears pending join", async () => {
    await guest.controller.joinGroup("00000000-0000-0000-0000-000000000001");
    await waitFor(
      () => guest.snapshot.error === "group_missing",
      "missing group error",
    );
    check(
      !guest.snapshot.busy && !guest.snapshot.group,
      "Missing group kept pending membership",
    );
  });
  await step("restricted account cannot create or join group", async () => {
    const name = `syncplay-restricted-${run}`;
    const response = await getUserApi(host.api).createUserByName({
      createUserByName: { Name: name, Password: credentials.password },
    });
    temporaryUserId = response.data.Id!;
    await getUserApi(host.api).updateUserPolicy({
      userId: temporaryUserId,
      userPolicy: { ...response.data.Policy, SyncPlayAccess: "None" },
    });
    const restricted = await client(name, "restricted");
    let createStatus: number | undefined;
    try {
      await restricted.controller.createGroup("Denied group");
    } catch (error) {
      createStatus = (error as { response?: { status?: number } }).response
        ?.status;
    }
    check(createStatus === 403, `Expected create 403, got ${createStatus}`);
    let joinStatus: number | undefined;
    try {
      await restricted.controller.joinGroup(groupId);
    } catch (error) {
      joinStatus = (error as { response?: { status?: number } }).response
        ?.status;
    }
    check(joinStatus === 403, `Expected join 403, got ${joinStatus}`);
    check(!restricted.snapshot.group, "Restricted user joined group");
    return { createStatus, joinStatus };
  });
  await step(
    "all 22 Jellyfin SyncPlay endpoints exercised successfully",
    async () => {
      const missing = endpoints.filter(
        (path) => !requests.some((request) => request.path === path),
      );
      check(
        missing.length === 0,
        `Uncovered SyncPlay endpoints: ${missing.join(", ")}`,
      );
      return { covered: endpoints.length, endpoints };
    },
  );
} catch (error) {
  const http = error as {
    response?: { status?: number; data?: unknown };
    config?: { url?: string };
  };
  records.push({
    name: "failure",
    passed: false,
    detail: {
      message: error instanceof Error ? error.message : String(error),
      status: http.response?.status,
      path: http.config?.url,
      body: http.response?.data,
      clients: clients.map((client) => ({
        name: client.name,
        state: client.getState(),
        groupState: client.snapshot.groupState,
        repeatMode: client.snapshot.repeatMode,
        shuffleMode: client.snapshot.shuffleMode,
        ignoreWait: client.snapshot.ignoreWait,
      })),
    },
  });
  process.exitCode = 1;
  process.stderr.write(
    `FAIL ${error instanceof Error ? error.message : String(error)} ${http.config?.url ?? ""}\n`,
  );
} finally {
  for (const client of clients) client.dispose();
  await sleep(150);
  if (temporaryUserId && admin)
    await getUserApi(admin)
      .deleteUser({ userId: temporaryUserId })
      .catch(() => {});
  await mkdir(join(directory, "artifacts"), { recursive: true });
  await writeFile(
    join(directory, "artifacts/controller-integration.json"),
    JSON.stringify(
      {
        run,
        serverVersion: credentials.serverVersion,
        checkedAt: new Date().toISOString(),
        results: records,
        events: eventLog,
        requests,
        endpointCoverage: endpoints.map((path) => ({
          path,
          passed: requests.some((request) => request.path === path),
          count: requests.filter((request) => request.path === path).length,
        })),
      },
      null,
      2,
    ),
  );
}
