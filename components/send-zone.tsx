"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, Copy, Check, X, ArrowRight,
  Loader2, CheckCircle2, AlertTriangle, RefreshCcw,
  FileIcon, Activity
} from "lucide-react";
import {
  SIGNALING_URL, RTC_CONFIG, CHUNK_SIZE, MAX_BUFFERED,
  formatBytes, generateCode
} from "@/lib/webrtc-config";

type State = "idle" | "waiting" | "connecting" | "transferring" | "done" | "error";

function FileRow({ file, onRemove }: { file: File; onRemove?: () => void }) {
  const ext = (file.name.split(".").pop() ?? "file").toUpperCase();
  return (
    <div className="group flex items-center justify-between py-2 border-b border-zinc-900 last:border-0">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="w-8 h-8 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-mono font-medium text-zinc-400">{ext.substring(0, 3)}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-200 font-medium">{file.name}</p>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{formatBytes(file.size)}</p>
        </div>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function SendZone() {
  const [state, setState] = useState<State>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileIdx, setCurrentFileIdx] = useState(0);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const filesRef = useRef<File[]>([]);

  useEffect(() => { filesRef.current = files; }, [files]);

  function cleanup() {
    channelRef.current?.close(); channelRef.current = null;
    pcRef.current?.close();      pcRef.current      = null;
    wsRef.current?.close();      wsRef.current      = null;
  }

  function reset() {
    cleanup();
    setState("idle"); setFiles([]); setCode(""); setProgress(0);
    setCurrentFileIdx(0); setError("");
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) setFiles(p => [...p, ...dropped]);
  }, []);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const sel = Array.from(e.target.files ?? []);
    if (sel.length) setFiles(p => [...p, ...sel]);
    e.target.value = "";
  }, []);

  async function sendAllFiles(ch: RTCDataChannel, all: File[]) {
    ch.send(JSON.stringify({ type: "transfer-start", fileCount: all.length }));
    for (let i = 0; i < all.length; i++) {
      setCurrentFileIdx(i); setProgress(0);
      const file = all[i];
      ch.send(JSON.stringify({
        type: "file-start", name: file.name,
        size: file.size, mimeType: file.type || "application/octet-stream", index: i,
      }));
      const buf = await file.arrayBuffer();
      let offset = 0;
      while (offset < buf.byteLength) {
        if (ch.bufferedAmount > MAX_BUFFERED) {
          await new Promise<void>(res => {
            ch.bufferedAmountLowThreshold = MAX_BUFFERED / 2;
            ch.addEventListener("bufferedamountlow", () => res(), { once: true });
          });
        }
        const end = Math.min(offset + CHUNK_SIZE, buf.byteLength);
        ch.send(buf.slice(offset, end));
        offset = end;
        setProgress(Math.round((offset / buf.byteLength) * 100));
      }
      ch.send(JSON.stringify({ type: "file-end", index: i }));
    }
    ch.send(JSON.stringify({ type: "transfer-end" }));
  }

  async function startSending() {
    if (!filesRef.current.length) return;
    const newCode = generateCode();
    setCode(newCode); setState("waiting"); setError("");

    const ws = new WebSocket(SIGNALING_URL); wsRef.current = ws;
    const pc = new RTCPeerConnection(RTC_CONFIG); pcRef.current = pc;
    const ch = pc.createDataChannel("filetransfer", { ordered: true }); channelRef.current = ch;

    ch.onopen = async () => {
      setState("transferring");
      try { await sendAllFiles(ch, filesRef.current); setState("done"); }
      catch { setError("Transfer failed."); setState("error"); }
    };
    ch.onerror = () => { setError("DataChannel error."); setState("error"); };

    pc.onicecandidate = e => {
      if (e.candidate && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "ice-candidate", candidate: e.candidate }));
    };

    const iceQueue: RTCIceCandidateInit[] = [];
    let isRemoteSet = false;

    ws.onopen = () => ws.send(JSON.stringify({ type: "create", code: newCode }));
    ws.onerror = () => { setError("Cannot reach signaling server."); setState("error"); };

    ws.onmessage = async ({ data }) => {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case "receiver-joined":
          setState("connecting");
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: "offer", sdp: pc.localDescription }));
          } catch { setError("Failed to create offer."); setState("error"); }
          break;
        case "answer":
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            .catch(() => { setError("Connection failed."); setState("error"); });
          isRemoteSet = true;
          iceQueue.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
          iceQueue.length = 0;
          break;
        case "ice-candidate":
          if (isRemoteSet) pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          else iceQueue.push(msg.candidate);
          break;
        case "error":
          setError(msg.message); setState("error"); break;
        case "peer-disconnected":
          if (state !== "done") { setError("Receiver disconnected."); setState("error"); }
          break;
      }
    };
  }

  async function copyCode() {
    await navigator.clipboard.writeText(code);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="w-full">
      {state === "idle" && (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => document.getElementById("fs-input")?.click()}
            className={`relative flex flex-col items-center justify-center p-8 rounded-lg border border-dashed transition-colors cursor-pointer
              ${isDragging ? "border-white bg-zinc-900" : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/50"}`}
          >
            <input id="fs-input" type="file" multiple className="hidden" onChange={handleInput} />
            <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-md flex items-center justify-center mb-3">
              <Upload className="w-4 h-4 text-zinc-400" />
            </div>
            <p className="text-sm text-zinc-300 font-medium">Click or drag files here</p>
            <p className="text-xs text-zinc-500 mt-1">Unlimited file size</p>
          </div>

          {files.length > 0 && (
            <div className="animate-slide-up space-y-4">
              <div className="max-h-48 overflow-y-auto border-t border-zinc-900">
                {files.map((f, i) => (
                  <FileRow key={i} file={f} onRemove={() => setFiles(p => p.filter((_, j) => j !== i))} />
                ))}
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
                <div className="text-xs text-zinc-500">
                  <span className="text-zinc-300 font-medium">{files.length}</span> file{files.length !== 1 ? "s" : ""}
                  {" · "}<span className="font-mono">{formatBytes(totalSize)}</span>
                </div>
                <button
                  onClick={startSending}
                  className="bg-white text-black text-sm font-medium px-4 py-2 rounded-md hover:bg-zinc-200 active:scale-95 transition-all flex items-center gap-2"
                >
                  Generate Link
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {state === "waiting" && (
        <div className="py-6 text-center animate-slide-up space-y-6">
          <div>
            <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider mb-2">Share Code</p>
            <div className="flex justify-center items-center gap-3">
              <div className="text-4xl font-mono tracking-[0.2em] font-light text-white">
                {code.slice(0,3)}<span className="text-zinc-700">·</span>{code.slice(3)}
              </div>
              <button
                onClick={copyCode}
                className="p-2 border border-zinc-800 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Waiting for receiver
          </div>

          <button onClick={reset} className="text-xs text-zinc-600 hover:text-white transition-colors uppercase tracking-widest font-mono">
            Cancel
          </button>
        </div>
      )}

      {state === "connecting" && (
        <div className="py-12 text-center animate-slide-up flex flex-col items-center">
          <Activity className="w-8 h-8 text-zinc-400 animate-pulse mb-4" />
          <p className="text-zinc-300 font-medium">Negotiating connection</p>
          <p className="text-xs text-zinc-500 mt-1 font-mono">WebRTC Handshake</p>
        </div>
      )}

      {state === "transferring" && (
        <div className="py-4 animate-slide-up">
          <div className="flex justify-between items-end mb-2">
            <div>
              <p className="text-sm font-medium text-zinc-200 truncate max-w-[200px]">
                {files[currentFileIdx]?.name}
              </p>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">
                {currentFileIdx + 1} / {files.length}
              </p>
            </div>
            <div className="text-xl font-light font-mono tracking-tight text-white">
              {progress}%
            </div>
          </div>
          <div className="h-1 bg-zinc-900 overflow-hidden w-full">
            <div 
              className="h-full bg-white transition-all duration-100" 
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>
      )}

      {state === "done" && (
        <div className="py-8 text-center animate-slide-up flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-4">
            <CheckCircle2 className="w-6 h-6 text-black" />
          </div>
          <p className="text-lg font-medium text-white">Transfer Complete</p>
          <p className="text-xs text-zinc-500 font-mono mt-1 mb-6">
            {files.length} FILE{files.length !== 1 ? "S" : ""} DELIVERED
          </p>
          <button
            onClick={reset}
            className="border border-zinc-800 text-zinc-300 bg-zinc-900 hover:bg-zinc-800 text-sm font-medium px-4 py-2 rounded-md transition-all flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Send New
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
