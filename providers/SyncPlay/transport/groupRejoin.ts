/** Membership belongs to the socket that joined, not a delayed React connection flag. */
export function createGroupRejoin(
  join: (groupId: string, signal: AbortSignal) => Promise<unknown>,
) {
  let group: string | null = null;
  let joinedSocket: object | null = null;
  let request: AbortController | null = null;
  return {
    update(groupId: string | null, socket: object | null, isOpen: boolean) {
      if (groupId !== group) {
        request?.abort();
        request = null;
        group = groupId;
        joinedSocket = socket;
        return;
      }
      if (!groupId || !socket || !isOpen || socket === joinedSocket) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      joinedSocket = socket;
      void join(groupId, controller.signal).catch((error) => {
        if (!controller.signal.aborted) {
          joinedSocket = null;
          console.error("SyncPlay: failed to rejoin group", error);
        }
      });
    },
    dispose() {
      request?.abort();
      request = null;
      group = null;
      joinedSocket = null;
    },
  };
}
