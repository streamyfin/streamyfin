/**
 * useSyncPlayWebSocket
 *
 * Hook that connects the SyncPlay manager to WebSocket messages.
 * Listens for SyncPlayCommand and SyncPlayGroupUpdate messages.
 *
 * IMPORTANT: We subscribe directly to the WebSocket via `addEventListener`
 * rather than reading WebSocketProvider's `lastMessage` state. That state
 * only holds the most recent message, so when the server emits bursts
 * after a join (GroupJoined + StateUpdate + UserJoined + PlayQueue, all
 * within a few ms), React's batching causes earlier messages to be
 * overwritten before our effect can read them — most notably the
 * GroupJoined message, which left the joining client thinking it hadn't
 * joined while other members already saw it as a participant.
 *
 * Listening on the raw socket guarantees we see every frame in order.
 */

import { useEffect } from "react";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import type { SyncPlayManager } from "../Manager";
import type { GroupUpdate, SendCommand } from "../types";

/**
 * Hook to connect SyncPlay manager to WebSocket
 */
export function useSyncPlayWebSocket(manager: SyncPlayManager | null): void {
  const { ws } = useWebSocketContext();

  useEffect(() => {
    if (!ws || !manager) return;

    const handleMessage = (event: WebSocketMessageEvent) => {
      let parsed: { MessageType?: string; Data?: unknown };
      try {
        parsed = JSON.parse(event.data as string);
      } catch (error) {
        console.error("SyncPlay: failed to parse WebSocket message", error);
        return;
      }

      const { MessageType, Data } = parsed;

      // Only handle SyncPlay messages here; everything else is handled
      // elsewhere via WebSocketProvider's lastMessage.
      if (!MessageType?.startsWith("SyncPlay")) return;

      console.log(
        `SyncPlay WebSocket [${MessageType}]:`,
        JSON.stringify(Data).substring(0, 300),
      );

      switch (MessageType) {
        case "SyncPlayCommand": {
          const command = Data as SendCommand;
          console.log(
            `SyncPlay: COMMAND received - ${command.Command} at ${command.When}`,
            command.Command === "Seek"
              ? `position=${command.PositionTicks}`
              : "",
          );

          // Note: it's normal for controls to be missing here during the
          // join → navigate → load window. Manager stashes the command and
          // replays it on attach.
          manager.processCommand(command);
          break;
        }

        case "SyncPlayGroupUpdate": {
          // SDK's `GroupUpdate` type is a discriminated union with a
          // narrower `Type` enum than the wire format. Cast through
          // unknown so upstream `Manager.processGroupUpdate` can switch
          // on the real string.
          const update = Data as unknown as GroupUpdate;
          console.debug(
            "SyncPlay: group update -",
            (update as { Type?: string }).Type,
          );
          manager.processGroupUpdate(update);
          break;
        }

        default:
          break;
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => {
      ws.removeEventListener("message", handleMessage);
    };
  }, [ws, manager]);
}
