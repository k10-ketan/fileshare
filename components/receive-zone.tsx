"use client";

import { useState, useRef } from "react";
import {
  ArrowRight, Loader2, CheckCircle2, AlertTriangle, RefreshCcw, Activity
} from "lucide-react";
import {
  SIGNALING_URL, RTC_CONFIG, formatBytes
} from "@/lib/webrtc-config";

type State = "idle" | "connecting" | "receiving" | "done" | "error";
interface FileMeta { name: string; size: number; mimeType: string; }
interface ReceivedFile { name: string; size: number; }

function DigitBox({
  value, isFocused, inputRef, onChange, onKeyDown, onFocus, onPaste,
}: {
  value: string;
  isFocused: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={`relative flex h-14 w-11 items-center justify-center rounded-md border transition-colors
      ${value
        ? "border-zinc-500 bg-zinc-900"
        : isFocused
          ? "border-white bg-black"
          : "border-zinc-800 bg-black"
      }`}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        maxLength={1}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onPaste={onPaste}
        className={`w-full bg-transparent text-center font-mono text-xl font-light outline-none caret-transparent
          ${value ? "text-white" : "text-zinc-600"}`}
        autoComplete="off"
      />
      {isFocused && !value && (
        <span className="pointer-events-none absolute h-6 w-[1px] bg-zinc-400 caret-blink" />
      )}
    </div>
  );
}

function ReceivedFileRow({ file, done = false }: { file: ReceivedFile; done?: boolean }) {
  const ext = (file.name.split(".").pop() ?? "file").toUpperCase();
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-900 last:border-0">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-mono font-medium text-zinc-400">{ext.substring(0, 3)}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-200 font-medium">{file.name}</p>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{formatBytes(file.size)}</p>
        </div>
      </div>
      {done && <CheckCircle2 className="shrink-0 h-4 w-4 text-zinc-600" />}
    </div>
  );
}

export default function ReceiveZone() {
  const [state, setState] = useState<State>("idle");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [totalFiles, setTotalFiles] = useState(0);
  const [curFileIdx, setCurFileIdx] = useState(0);
  const [curFileMeta, setCurFileMeta] = useState<ReceivedFile | null>(null);
  const [received, setReceived] = useState<ReceivedFile[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rxChunks = useRef<ArrayBuffer[]>([]);
  const rxBytes = useRef(0);
  const rxMeta = useRef<FileMeta | null>(null);

  function cleanup() {
    pcRef.current?.close(); pcRef.current = null;
    wsRef.current?.close(); wsRef.current = null;
  }

  function reset() {
    cleanup();
    setState("idle"); setDigits(["","","","","",""]); setProgress(0);
    setError(""); setTotalFiles(0); setCurFileIdx(0);
    setCurFileMeta(null); setReceived([]);
    rxChunks.current = []; rxBytes.current = 0; rxMeta.current = null;
  }

  function onDigitChange(i: number, raw: string) {
    const val = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits]; next[i] = val; setDigits(next);
    if (val && i < 5) inputRefs.current[i + 1]?.focus();
  }

  function onDigitKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[i]) { const n = [...digits]; n[i] = ""; setDigits(n); }
      else if (i > 0) { inputRefs.current[i - 1]?.focus(); }
    }
    if (e.key === "ArrowLeft" && i > 0) inputRefs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputRefs.current[i + 1]?.focus();
    if (e.key === "Enter" && digits.join("").length === 6) startReceiving();
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const nums = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!nums) return;
    const next = [...Array(6)].map((_, i) => nums[i] ?? "");
    setDigits(next);
    inputRefs.current[Math.min(nums.length, 5)]?.focus();
  }

  function triggerDownload(chunks: ArrayBuffer[], meta: FileMeta) {
    const blob = new Blob(chunks, { type: meta.mimeType });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: meta.name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }

  function setupChannel(ch: RTCDataChannel) {
    ch.binaryType = "arraybuffer";
    rxChunks.current = []; rxBytes.current = 0; rxMeta.current = null;

    ch.onmessage = ({ data }) => {
      if (typeof data === "string") {
        const msg = JSON.parse(data);
        switch (msg.type) {
          case "transfer-start":
            setTotalFiles(msg.fileCount); setState("receiving"); break;
          case "file-start":
            rxChunks.current = []; rxBytes.current = 0;
            rxMeta.current = { name: msg.name, size: msg.size, mimeType: msg.mimeType };
            setCurFileIdx(msg.index);
            setCurFileMeta({ name: msg.name, size: msg.size });
            setProgress(0); break;
          case "file-end": {
            const meta = rxMeta.current!;
            triggerDownload(rxChunks.current, meta);
            setReceived(p => [...p, { name: meta.name, size: meta.size }]);
            rxChunks.current = []; rxBytes.current = 0; rxMeta.current = null; break;
          }
          case "transfer-end":
            setState("done"); cleanup(); break;
        }
      } else {
        const chunk = data as ArrayBuffer;
        rxChunks.current.push(chunk);
        rxBytes.current += chunk.byteLength;
        if (rxMeta.current) {
          setProgress(Math.round((rxBytes.current / rxMeta.current.size) * 100));
        }
      }
    };

    ch.onerror = () => { setError("Connection error."); setState("error"); };
  }

  async function startReceiving() {
    const code = digits.join("");
    if (code.length !== 6) return;
    setState("connecting"); setError("");

    const ws = new WebSocket(SIGNALING_URL); wsRef.current = ws;
    const pc = new RTCPeerConnection(RTC_CONFIG); pcRef.current = pc;

    pc.onicecandidate = e => {
      if (e.candidate && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "ice-candidate", candidate: e.candidate }));
    };
    pc.ondatachannel = e => setupChannel(e.channel);

    ws.onopen = () => ws.send(JSON.stringify({ type: "join", code }));
    ws.onerror = () => { setError("Cannot reach server."); setState("error"); };

    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case "offer":
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          ws.send(JSON.stringify({ type: "answer", sdp: pc.localDescription })); break;
        case "ice-candidate":
          pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {}); break;
        case "error":
          setError(msg.message); setState("error"); break;
        case "peer-disconnected":
          if (state !== "done") { setError("Sender disconnected."); setState("error"); }
          break;
      }
    };
  }

  const codeComplete = digits.every(Boolean);

  return (
    <div className="w-full">
      {state === "idle" && (
        <div className="animate-slide-up space-y-6">
          <div className="text-center pt-2">
            <p className="text-sm text-zinc-300 font-medium">Connect to transfer</p>
            <p className="mt-1 text-xs text-zinc-500">Enter the 6-digit code</p>
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <DigitBox
                  key={i} value={digits[i]} isFocused={focusedIdx === i}
                  inputRef={el => { inputRefs.current[i] = el; }}
                  onChange={v => onDigitChange(i, v)} onKeyDown={e => onDigitKeyDown(i, e)}
                  onFocus={() => setFocusedIdx(i)} onPaste={onPaste}
                />
              ))}
            </div>
            <span className="text-zinc-700 text-lg mx-1 select-none">·</span>
            <div className="flex gap-1">
              {[3,4,5].map(i => (
                <DigitBox
                  key={i} value={digits[i]} isFocused={focusedIdx === i}
                  inputRef={el => { inputRefs.current[i] = el; }}
                  onChange={v => onDigitChange(i, v)} onKeyDown={e => onDigitKeyDown(i, e)}
                  onFocus={() => setFocusedIdx(i)} onPaste={onPaste}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-center text-xs text-red-400">{error}</p>}

          <button
            onClick={startReceiving}
            disabled={!codeComplete}
            className="w-full bg-white text-black text-sm font-medium px-4 py-3 rounded-md transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-zinc-200 active:scale-95 disabled:active:scale-100"
          >
            Connect
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {state === "connecting" && (
        <div className="py-12 text-center animate-slide-up flex flex-col items-center">
          <Activity className="w-8 h-8 text-zinc-400 animate-pulse mb-4" />
          <p className="text-zinc-300 font-medium">Connecting...</p>
          <p className="text-xs text-zinc-500 mt-1 font-mono">Code {digits.join("")}</p>
        </div>
      )}

      {state === "receiving" && (
        <div className="py-4 animate-slide-up">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-sm font-medium text-zinc-200 truncate max-w-[200px]">
                {curFileMeta?.name ?? "..."}
              </p>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                {curFileIdx + 1} / {totalFiles}
              </p>
            </div>
            <div className="text-xl font-light font-mono tracking-tight text-white">
              {progress}%
            </div>
          </div>
          <div className="h-1 bg-zinc-900 overflow-hidden w-full mb-6">
            <div 
              className="h-full bg-white transition-all duration-100" 
              style={{ width: `${progress}%` }} 
            />
          </div>

          {received.length > 0 && (
            <div className="border-t border-zinc-900 pt-2">
              <p className="text-[10px] text-zinc-600 font-mono uppercase mb-2 tracking-wider">Completed</p>
              {received.map((f, i) => <ReceivedFileRow key={i} file={f} done />)}
            </div>
          )}
        </div>
      )}

      {state === "done" && (
        <div className="py-8 text-center animate-slide-up flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6 text-black" />
          </div>
          <p className="text-lg font-medium text-white">All Received</p>
          <p className="text-xs text-zinc-500 font-mono mt-1 mb-6">
            {received.length} FILE{received.length !== 1 ? "S" : ""} SAVED
          </p>

          <div className="w-full text-left mb-6 border-y border-zinc-900 py-2">
             {received.map((f, i) => <ReceivedFileRow key={i} file={f} done />)}
          </div>

          <button
            onClick={reset}
            className="border border-zinc-800 text-zinc-300 bg-zinc-900 hover:bg-zinc-800 text-sm font-medium px-4 py-2 rounded-md transition-all flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Receive New
          </button>
        </div>
      )}

      {state === "error" && (
        <div className="py-8 text-center animate-slide-up flex flex-col items-center">
          <AlertTriangle className="w-8 h-8 text-zinc-400 mb-4" />
          <p className="text-zinc-200 font-medium">Connection Lost</p>
          <p className="text-xs text-zinc-500 mt-1 mb-6 max-w-[200px]">{error}</p>
          <button
            onClick={reset}
            className="bg-white text-black text-sm font-medium px-4 py-2 rounded-md transition-all flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
