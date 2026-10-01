import type {
  GroupUpdate,
  SendCommand,
} from "@jellyfin/sdk/lib/generated-client";
import { useEffect } from "react";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import type { SyncPlayManager } from "../Manager";

/** Shared pub/sub delivers every message synchronously, including join bursts. */
export function useSyncPlayWebSocket(manager: SyncPlayManager | null): void {
  const { subscribe } = useWebSocketContext();
  useEffect(() => {
    if (!manager) return;
    const offCommand = subscribe("SyncPlayCommand", (command: SendCommand) => {
      manager.processCommand(command);
    });
    const offGroup = subscribe("SyncPlayGroupUpdate", (update: GroupUpdate) => {
      manager.processGroupUpdate(update);
    });
    return () => {
      offCommand();
      offGroup();
    };
  }, [subscribe, manager]);
}
