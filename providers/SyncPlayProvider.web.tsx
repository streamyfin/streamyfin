import type { Api } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { getWebSocketUrl } from "@/utils/jellyfin/getWebSocketUrl";
import {
  initialSyncPlaySnapshot,
  SyncPlayController,
} from "@/utils/syncplay/controller";
import { createSyncPlayTransport } from "@/utils/syncplay/transport";
import type { useSyncPlay as nativeHook } from "./SyncPlayProvider";

type ContextValue = ReturnType<typeof nativeHook>;
const Context = createContext<ContextValue | null>(null);

/** Browser entry shares the production protocol without loading native services. */
export function SyncPlayProvider({
  api,
  user,
  deviceId,
  children,
}: {
  api: Api;
  user: UserDto;
  deviceId: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState(initialSyncPlaySnapshot);
  const listVideos = useCallback(
    async (searchTerm?: string) =>
      (
        await getItemsApi(api).getItems({
          userId: user.Id,
          recursive: true,
          includeItemTypes: ["Movie", "Episode", "Video"],
          excludeLocationTypes: ["Virtual"],
          searchTerm: searchTerm?.trim() || undefined,
          limit: 30,
          sortBy: ["SortName"],
        })
      ).data.Items ?? [],
    [api, user.Id],
  );
  const resolveVideos = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return [];
      return (
        (
          await getItemsApi(api).getItems({
            userId: user.Id,
            ids: [...new Set(ids)],
          })
        ).data.Items ?? []
      );
    },
    [api, user.Id],
  );
  const controller = useMemo(() => {
    const transport = createSyncPlayTransport(api);
    // The browser preview doubles as the local protocol test client. Log
    // only SyncPlay payloads, never socket URLs, headers or access tokens.
    const trace = (type: string, data: unknown) => {
      if (__DEV__) console.debug("[SyncPlay]", JSON.stringify({ type, data }));
    };
    return new SyncPlayController(
      {
        ...transport,
        ready: async (request) => {
          trace("Ready", request);
          await transport.ready(request);
        },
        buffering: async (request) => {
          trace("Buffering", request);
          await transport.buffering(request);
        },
      },
      setSnapshot,
    );
  }, [api]);
  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (closed) return;
      const url = getWebSocketUrl(api.basePath, api.accessToken, deviceId);
      if (!url) return;
      socket = new WebSocket(url);
      socket.onopen = () => controller.setConnected(true);
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (__DEV__ && message.MessageType?.startsWith("SyncPlay"))
            console.debug(
              "[SyncPlay]",
              JSON.stringify({ type: message.MessageType, data: message.Data }),
            );
          if (message.MessageType === "SyncPlayGroupUpdate")
            controller.handleGroupUpdate(message.Data);
          if (message.MessageType === "SyncPlayCommand")
            controller.handleCommand(message.Data);
        } catch {
          // A malformed optional socket event must not interrupt the client.
        }
      };
      socket.onclose = () => {
        controller.setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    const keepAlive = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ MessageType: "KeepAlive" }));
    }, 20000);
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      clearInterval(keepAlive);
      socket?.close();
      controller.dispose();
    };
  }, [api, controller, deviceId]);
  const value = useMemo<ContextValue>(
    () => ({
      ...snapshot,
      enabled: !!snapshot.group,
      supported: user.Policy?.SyncPlayAccess !== "None",
      canCreate:
        user.Policy?.SyncPlayAccess !== "None" &&
        user.Policy?.SyncPlayAccess !== "JoinGroups",
      error: snapshot.error ? t(`syncplay.errors.${snapshot.error}`) : null,
      refreshGroups: controller.refreshGroups,
      createGroup: controller.createGroup,
      joinGroup: controller.joinGroup,
      leaveGroup: controller.leaveGroup,
      clearError: controller.clearError,
      getGroup: controller.getGroup,
      queueItems: controller.queueItems,
      removePlaylistItems: controller.removePlaylistItems,
      clearPlaylist: controller.clearPlaylist,
      movePlaylistItem: controller.movePlaylistItem,
      requestPlaylistItem: controller.requestPlaylistItem,
      setRepeatMode: controller.setRepeatMode,
      setShuffleMode: controller.setShuffleMode,
      setIgnoreWait: controller.setIgnoreWait,
      listVideos,
      resolveVideos,
      playItems: controller.playItems,
      requestPause: controller.requestPause,
      requestUnpause: controller.requestUnpause,
      requestSeek: controller.requestSeek,
      requestStop: controller.requestStop,
      requestNext: controller.requestNext,
      requestPrevious: controller.requestPrevious,
      registerLauncher: controller.registerLauncher,
      registerPlayer: controller.registerPlayer,
      notifyReady: controller.notifyReady,
      notifyBuffering: controller.notifyBuffering,
      notifyProgress: controller.notifyProgress,
      notifyEnded: controller.notifyEnded,
    }),
    [
      controller,
      snapshot,
      t,
      user.Policy?.SyncPlayAccess,
      listVideos,
      resolveVideos,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSyncPlay() {
  const value = useContext(Context);
  if (!value) throw new Error("SyncPlayProvider is required");
  return value;
}
