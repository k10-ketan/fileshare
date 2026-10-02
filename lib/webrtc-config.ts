const defaultHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
export const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_URL || `ws://${defaultHost}:8080`;

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
  iceCandidatePoolSize: 10,
};

export const CHUNK_SIZE = 16 * 1024;      // 16 KB per chunk
export const MAX_BUFFERED = 256 * 1024;   // pause when buffer exceeds 256 KB

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
