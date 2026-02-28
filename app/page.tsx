"use client";

import { useState } from "react";
import UploadZone from "@/components/upload-zone";
import RetrieveZone from "@/components/retrieve-zone";
import { Upload, Download } from "lucide-react";

export default function Home() {
  const [tab, setTab] = useState<"upload" | "download">("upload");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Logo / Title */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          FileShare
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Upload any file · Share the key · Download anywhere
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="mb-6 flex gap-1 rounded-lg bg-neutral-800/50 p-1">
        <button
          onClick={() => setTab("upload")}
          className={`flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors ${
            tab === "upload"
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
        <button
          onClick={() => setTab("download")}
          className={`flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors ${
            tab === "download"
              ? "bg-neutral-700 text-white"
              : "text-neutral-400 hover:text-white"
          }`}
        >
          <Download className="h-4 w-4" />
          Download
        </button>
      </div>

      {/* Content */}
      {tab === "upload" ? <UploadZone /> : <RetrieveZone />}

      {/* Footer */}
      <p className="mt-10 text-xs text-neutral-600">
        Files auto-expire after 24 hours · Max 500MB
      </p>
    </div>
  );
}
