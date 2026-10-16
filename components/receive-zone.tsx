"use client";

import { useState, useRef } from "react";
import {
  ArrowRight, Loader2, CheckCircle2, AlertTriangle, RefreshCcw, Activity, Download
} from "lucide-react";
import {
  SIGNALING_URL, RTC_CONFIG, formatBytes
} from "@/lib/webrtc-config";

type State = "idle" | "connecting" | "receiving" | "confirming" | "done" | "error";
interface FileMeta { name: string; size: number; mimeType: string; }
interface ReceivedFile { name: string; size: number; blob: Blob; downloaded: boolean; downloadError?: string; }

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

function ReceivedFileRow({
  file,
  onDownload,
}: {
  file: ReceivedFile;
  onDownload: () => void;
}) {
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
          {file.downloadError && <p className="mt-1 text-xs text-red-400">{file.downloadError}</p>}
        </div>
      </div>
      <button
        onClick={onDownload}
        className="ml-2 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-800"
      >
        {file.downloaded ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Download className="h-3.5 w-3.5" />}
        {file.downloaded ? "Download again" : "Download"}
      </button>
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
  const [curFileMeta, setCurFileMeta] = useState<{ name: string; size: number } | null>(null);
  const [received, setReceived] = useState<ReceivedFile[]>([]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rxChunks = useRef<ArrayBuffer[]>([]);
  const rxBytes = useRef(0);
  const rxMeta = useRef<FileMeta | null>(null);
  const receivedCount = useRef(0);
  const expectedFiles = useRef(0);
  const stateRef = useRef<State>("idle");

  function setStateSync(s: State) { stateRef.current = s; setState(s); }

  function cleanup() {
    pcRef.current?.close(); pcRef.current = null;
    wsRef.current?.close(); wsRef.current = null;
  }

  function reset() {
    cleanup();
    setStateSync("idle"); setDigits(["","","","","",""]); setProgress(0);
    setError(""); setTotalFiles(0); setCurFileIdx(0);
    setCurFileMeta(null); setReceived([]);
    rxChunks.current = []; rxBytes.current = 0; rxMeta.current = null; receivedCount.current = 0; expectedFiles.current = 0;
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

  function triggerDownload(file: ReceivedFile) {
    const blob = file.blob;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: file.name });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }

  function downloadReceivedFile(index: number) {
    const file = received[index];
    if (!file) return;
    try {
      triggerDownload(file);
      setReceived((current) => current.map((item, i) => i === index ? { ...item, downloaded: true, downloadError: undefined } : item));
    } catch {
      setReceived((current) => current.map((item, i) => i === index ? { ...item, downloadError: "Could not start this download. Please try again." } : item));
    }
  }

  function downloadAllReceivedFiles() {
    const failedIndexes: number[] = [];
    received.forEach((file, index) => {
      try {
        triggerDownload(file);
      } catch {
        failedIndexes.push(index);
      }
    });

    setReceived((current) => current.map((file, index) => ({
      ...file,
      downloaded: failedIndexes.includes(index) ? file.downloaded : true,
      downloadError: failedIndexes.includes(index)
        ? "Could not start this download. Please try again."
        : undefined,
    })));
  }

  function setupChannel(ch: RTCDataChannel) {
    ch.binaryType = "arraybuffer";
    rxChunks.current = []; rxBytes.current = 0; rxMeta.current = null; receivedCount.current = 0; expectedFiles.current = 0;

    const reportTransferError = (message: string) => {
      if (ch.readyState === "open") {
        ch.send(JSON.stringify({ type: "transfer-error", message }));
      }
      setError(message);
      setStateSync("error");
    };

    ch.onmessage = ({ data }) => {
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data);
          switch (msg.type) {
            case "transfer-start":
              expectedFiles.current = msg.fileCount;
              setTotalFiles(msg.fileCount); setStateSync("receiving"); break;
            case "file-start":
              rxChunks.current = []; rxBytes.current = 0;
              rxMeta.current = { name: msg.name, size: msg.size, mimeType: msg.mimeType };
              setCurFileIdx(msg.index);
              setCurFileMeta({ name: msg.name, size: msg.size });
              setProgress(0); break;
            case "file-end": {
              const meta = rxMeta.current;
              if (!meta) {
                reportTransferError("The sender ended a file before its details arrived.");
                break;
              }
              if (rxBytes.current !== meta.size) {
                reportTransferError(`The received file "${meta.name}" is incomplete (${rxBytes.current} of ${meta.size} bytes).`);
                break;
              }
              try {
                const file: ReceivedFile = {
                  name: meta.name,
                  size: meta.size,
                  blob: new Blob(rxChunks.current, { type: meta.mimeType }),
                  downloaded: false,
                };
                ch.send(JSON.stringify({ type: "file-received", index: msg.index, name: meta.name }));
                receivedCount.current += 1;
                setReceived((current) => [...current, file]);
                rxChunks.current = []; rxBytes.current = 0; rxMeta.current = null;
              } catch {
                reportTransferError(`Could not start the download for "${meta.name}".`);
              }
              break;
            }
            case "transfer-end":
              if (receivedCount.current !== expectedFiles.current) {
                reportTransferError(`Only ${receivedCount.current} of ${expectedFiles.current} files were received.`);
                break;
              }
              ch.send(JSON.stringify({ type: "transfer-complete", fileCount: receivedCount.current }));
              setStateSync("confirming"); break;
            case "sender-confirmation":
              ch.send(JSON.stringify({ type: "receiver-confirmation" }));
              setStateSync("done"); cleanup(); break;
          }
        } catch {
          reportTransferError("The transfer data could not be processed.");
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

    ch.onerror = () => {
      if (stateRef.current === "done" || stateRef.current === "error") return;
      setError("Connection error while receiving files.");
      setStateSync("error");
    };
    ch.onclose = () => {
      if (stateRef.current !== "done" && stateRef.current !== "error") {
        setError("Connection closed before all files were received.");
        setStateSync("error");
      }
    };
  }

  async function startReceiving() {
    const code = digits.join("");
    if (code.length !== 6) return;
    setStateSync("connecting"); setError("");

    const ws = new WebSocket(SIGNALING_URL); wsRef.current = ws;
    const pc = new RTCPeerConnection(RTC_CONFIG); pcRef.current = pc;

    const iceQueue: RTCIceCandidateInit[] = [];
    let isRemoteSet = false;

    // Trickle ICE: send candidates immediately as found
    pc.onicecandidate = e => {
      if (e.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ice-candidate", candidate: e.candidate }));
      }
    };
    pc.ondatachannel = e => setupChannel(e.channel);

    ws.onopen = () => ws.send(JSON.stringify({ type: "join", code }));
    ws.onerror = () => { setError("Cannot reach server."); setStateSync("error"); };

    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case "offer":
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          isRemoteSet = true;
          // Flush queued candidates now that remote desc is set
          iceQueue.splice(0).forEach(c =>
            pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
          );
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          ws.send(JSON.stringify({ type: "answer", sdp: pc.localDescription }));
          break;
        case "ice-candidate":
          if (isRemoteSet) {
            pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else {
            iceQueue.push(msg.candidate);
          }
          break;
        case "error":
          setError(msg.message); setStateSync("error"); break;
        case "peer-disconnected":
          if (stateRef.current !== "done") { setError("Sender disconnected."); setStateSync("error"); }
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
              {received.map((f, i) => <ReceivedFileRow key={i} file={f} onDownload={() => downloadReceivedFile(i)} />)}
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
            {received.length} FILE{received.length !== 1 ? "S" : ""} READY TO DOWNLOAD
          </p>

          <div className="w-full text-left mb-6 border-y border-zinc-900 py-2">
             {received.map((f, i) => <ReceivedFileRow key={i} file={f} onDownload={() => downloadReceivedFile(i)} />)}
          </div>

          {received.length > 1 && (
            <button
              onClick={downloadAllReceivedFiles}
              className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
            >
              <Download className="h-4 w-4" />
              Download All ({received.length})
            </button>
          )}

          <button
            onClick={reset}
            className="border border-zinc-800 text-zinc-300 bg-zinc-900 hover:bg-zinc-800 text-sm font-medium px-4 py-2 rounded-md transition-all flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Receive New
          </button>
        </div>
      )}

      {state === "confirming" && (
        <div className="py-12 text-center animate-slide-up flex flex-col items-center">
          <Loader2 className="w-8 h-8 text-zinc-400 animate-spin mb-4" />
          <p className="text-zinc-300 font-medium">Finishing transfer</p>
          <p className="text-xs text-zinc-500 mt-1">Confirming delivery with the sender</p>
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
