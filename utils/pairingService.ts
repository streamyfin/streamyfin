import dgram from "react-native-udp";

const PAIRING_PORT = 54322;
const PAIRING_MESSAGE_TYPE = "streamyfin-pair-response";

export interface PairingCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

export function generatePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function startPairingListener(
  code: string,
  onCredentialsReceived: (credentials: PairingCredentials) => void,
  onError?: (error: string) => void,
): () => void {
  let active = true;

  const socket = dgram.createSocket({
    type: "udp4",
    reusePort: true,
    debug: __DEV__,
  });

  socket.on("error", (err) => {
    console.error("[PairingService] Socket error:", err);
    onError?.(err.message);
    cleanup();
  });

  socket.bind(PAIRING_PORT, () => {
    console.log("[PairingService] Listening on port", PAIRING_PORT);
  });

  socket.on("message", (msg) => {
    if (!active) return;

    try {
      const data = JSON.parse(new TextDecoder().decode(msg));

      if (data.type !== PAIRING_MESSAGE_TYPE) return;
      if (data.code !== code) return;

      if (!data.server_url || !data.username || !data.password) {
        console.error("[PairingService] Missing fields in pairing response");
        return;
      }

      console.log("[PairingService] Credentials received");
      active = false;
      onCredentialsReceived({
        serverUrl: data.server_url,
        username: data.username,
        password: data.password,
      });
      cleanup();
    } catch (error) {
      console.error("[PairingService] Error parsing message:", error);
    }
  });

  function cleanup() {
    active = false;
    try {
      socket.close();
    } catch {
      // Socket may already be closed
    }
  }

  return cleanup;
}

export function sendCredentialsToTV(
  code: string,
  serverUrl: string,
  username: string,
  password: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({
      type: "udp4",
      reusePort: true,
      debug: __DEV__,
    });

    const message = JSON.stringify({
      type: PAIRING_MESSAGE_TYPE,
      code,
      server_url: serverUrl,
      username,
      password,
    });

    const messageBuffer = new TextEncoder().encode(message);

    socket.on("error", (err) => {
      reject(err);
      try {
        socket.close();
      } catch {
        // Ignore
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        socket.send(
          messageBuffer,
          0,
          messageBuffer.length,
          PAIRING_PORT,
          "255.255.255.255",
          (err) => {
            try {
              socket.close();
            } catch {
              // Ignore
            }
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          },
        );
      } catch (error) {
        try {
          socket.close();
        } catch {
          // Ignore
        }
        reject(error);
      }
    });
  });
}
