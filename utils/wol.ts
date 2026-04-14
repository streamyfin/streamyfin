import dgram from "react-native-udp";
import { getSSIDSync } from "@/modules/wifi-ssid";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import {
  getServerLocalConfig,
  getServerWolConfig,
} from "@/utils/secureCredentials";

const WOL_PORT = 9;
const WOL_BROADCAST = "255.255.255.255";
const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

/**
 * Validate a MAC address string (e.g., "AA:BB:CC:DD:EE:FF").
 */
export function validateMacAddress(mac: string): boolean {
  return MAC_REGEX.test(mac.trim());
}

/**
 * Build a Wake-on-LAN magic packet for the given MAC address.
 * Format: 6 bytes of 0xFF followed by the MAC address repeated 16 times (102 bytes total).
 */
export function buildMagicPacket(macAddress: string): Uint8Array {
  const macBytes = macAddress
    .trim()
    .split(/[:-]/)
    .map((hex) => Number.parseInt(hex, 16));

  const packet = new Uint8Array(102);

  // 6 bytes of 0xFF
  for (let i = 0; i < 6; i++) {
    packet[i] = 0xff;
  }

  // MAC address repeated 16 times
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 6; j++) {
      packet[6 + i * 6 + j] = macBytes[j];
    }
  }

  return packet;
}

/**
 * Send a Wake-on-LAN magic packet via UDP broadcast.
 */
export function sendWolPacket(macAddress: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const packet = buildMagicPacket(macAddress);

    const socket = dgram.createSocket({
      type: "udp4",
      reusePort: true,
    });

    socket.on("error", (err) => {
      socket.close();
      reject(err);
    });

    socket.bind(0, () => {
      socket.setBroadcast(true);
      socket.send(packet, 0, packet.length, WOL_PORT, WOL_BROADCAST, (err) => {
        socket.close();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Check if the device is on a configured home WiFi network for the given server.
 * Returns true if:
 * - No local network config exists (no WiFi restriction configured)
 * - No home WiFi SSIDs are configured
 * - SSID detection is unavailable (Android)
 * - Current SSID matches a configured home WiFi network
 */
function isOnHomeNetwork(serverUrl: string): boolean {
  const localConfig = getServerLocalConfig(serverUrl);

  // No local network config or no SSIDs configured — don't restrict WoL
  if (!localConfig?.homeWifiSSIDs?.length) {
    return true;
  }

  const currentSSID = getSSIDSync();

  // SSID detection unavailable (Android) — don't restrict WoL
  if (currentSSID === null) {
    return true;
  }

  return localConfig.homeWifiSSIDs.includes(currentSSID);
}

/**
 * Send a Wake-on-LAN packet if configured and on the home network.
 * Failures are logged but never block app startup.
 */
export async function wakeServerIfNeeded(serverUrl: string): Promise<void> {
  try {
    const config = getServerWolConfig(serverUrl);

    if (!config?.enabled || !validateMacAddress(config.macAddress)) {
      return;
    }

    if (!isOnHomeNetwork(serverUrl)) {
      return;
    }

    writeInfoLog(`[WakeOnLan] Sending magic packet to ${config.macAddress}`);

    await sendWolPacket(config.macAddress);

    writeInfoLog("[WakeOnLan] Magic packet sent successfully");
  } catch (e) {
    writeErrorLog(
      `[WakeOnLan] Failed to send magic packet: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
