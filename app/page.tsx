"use client";

import { useState } from "react";
import SendZone from "@/components/send-zone";
import ReceiveZone from "@/components/receive-zone";
import { ArrowUpRight, ArrowDownRight, Globe } from "lucide-react";

export default function Home() {
  const [tab, setTab] = useState<"send" | "receive">("send");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 selection:bg-white selection:text-black">
      {/* Top Left Branding */}
      <div className="absolute top-6 left-6 flex items-center gap-2 text-sm font-mono text-zinc-400 select-none opacity-0 animate-slide-up">
        <Globe className="w-4 h-4" />
        <span>P2P_FILE_TRANSFER</span>
      </div>

      <div className="w-full max-w-md w-full opacity-0 animate-slide-up delay-100">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-medium tracking-tight mb-2">
            FileShare.
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Direct device-to-device transfer.
            <br />
            No servers. No limits.
          </p>
        </div>

        {/* Minimalist Switcher */}
        <div className="flex p-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-lg">
          <button
            onClick={() => setTab("send")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-all ${
              tab === "send"
                ? "bg-white text-black shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            Send
          </button>
          <button
            onClick={() => setTab("receive")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-all ${
              tab === "receive"
                ? "bg-white text-black shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <ArrowDownRight className="w-4 h-4" />
            Receive
          </button>
        </div>

        {/* Content Container */}
        <div className="bg-black border border-zinc-800 rounded-xl p-1 relative overflow-hidden">

          <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-5">
            {tab === "send" ? <SendZone /> : <ReceiveZone />}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-zinc-900 text-center">
          <p className="text-xs font-mono text-zinc-600 uppercase tracking-widest">
            End-to-End Encrypted via WebRTC
          </p>
        </div>
      </div>
    </div>
  );
}
