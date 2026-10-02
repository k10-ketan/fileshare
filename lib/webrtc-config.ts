const defaultHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
export const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_URL || `ws://${defaultHost}:8080`;

// LAN-first config: skip external STUN so ICE gathering finishes in <200ms
// on same-network transfers. Add STUN only if you need cross-network support.
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 5,
  iceTransportPolicy: "all",
};

export const CHUNK_SIZE = 64 * 1024;       // 64 KB chunks (4x faster than 16 KB)
export const MAX_BUFFERED = 4 * 1024 * 1024; // 4 MB buffer threshold

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const s = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
