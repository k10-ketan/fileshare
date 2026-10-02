// Auto-detect signaling URL: same host/port as the app, at /signal
// Works on LAN, across networks, or when tunneled — zero config needed.
function getSignalingUrl(): string {
  if (process.env.NEXT_PUBLIC_SIGNALING_URL) return process.env.NEXT_PUBLIC_SIGNALING_URL;
  if (typeof window === "undefined") return "ws://localhost:3000/signal";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/signal`;
}

export const SIGNALING_URL = getSignalingUrl();

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // STUN – for LAN/same-network (fast, direct connection)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    // TURN – required for cross-network (different routers/NAT)
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
};

export const CHUNK_SIZE = 64 * 1024;          // 64 KB chunks
export const MAX_BUFFERED = 4 * 1024 * 1024;  // 4 MB buffer

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
