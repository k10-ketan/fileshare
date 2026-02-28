"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import {
  Download,
  Loader2,
  AlertCircle,
  FileIcon,
  Check,
  ArrowLeft,
  Search,
} from "lucide-react";

interface FileInfo {
  id: string;
  name: string;
  size: number;
  status: "idle" | "downloading" | "done" | "error";
}

interface ShareInfo {
  key: string;
  createdAt: string;
  files: FileInfo[];
}

export default function RetrieveZone() {
  const [inputKey, setInputKey] = useState("");
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const fetchFiles = async () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setError("Please enter a retrieval key.");
      return;
    }
    setLoading(true);
    setError(null);
    setShare(null);

    try {
      const res = await fetch(`/api/retrieve/${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "File not found or expired.");
        return;
      }
      const data = await res.json();
      setShare({
        key: data.key,
        createdAt: data.createdAt,
        files: data.files.map((f: { id: string; name: string; size: number }) => ({
          ...f,
          status: "idle" as const,
        })),
      });
    } catch {
      setError("Failed to retrieve files.");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (fileId: string) => {
    if (!share) return;

    setShare((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map((f) =>
          f.id === fileId ? { ...f, status: "downloading" as const } : f
        ),
      };
    });

    try {
      const res = await fetch(
        `/api/retrieve/${encodeURIComponent(share.key)}/${encodeURIComponent(fileId)}`
      );

      if (!res.ok) {
        setShare((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            files: prev.files.map((f) =>
              f.id === fileId ? { ...f, status: "error" as const } : f
            ),
          };
        });
        return;
      }

      const disposition = res.headers.get("Content-Disposition");
      let filename = "download";
      if (disposition) {
        const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/);
        if (utf8Match) {
          filename = decodeURIComponent(utf8Match[1]);
        } else {
          const match = disposition.match(/filename="?([^";\n]+)"?/);
          if (match) filename = decodeURIComponent(match[1]);
        }
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setShare((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          files: prev.files.map((f) =>
            f.id === fileId ? { ...f, status: "done" as const } : f
          ),
        };
      });
    } catch {
      setShare((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          files: prev.files.map((f) =>
            f.id === fileId ? { ...f, status: "error" as const } : f
          ),
        };
      });
    }
  };

  const downloadAll = async () => {
    if (!share) return;
    setDownloadingAll(true);
    for (const file of share.files) {
      if (file.status !== "done") {
        await downloadFile(file.id);
      }
    }
    setDownloadingAll(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") fetchFiles();
  };

  const handleBack = () => {
    setShare(null);
    setError(null);
    setInputKey("");
  };

  const getFileExtension = (name: string) => {
    const ext = name.split(".").pop()?.toUpperCase() || "FILE";
    return ext.length > 5 ? ext.slice(0, 5) : ext;
  };

  const totalSize = share?.files.reduce((sum, f) => sum + f.size, 0) ?? 0;
  const anyDownloading = share?.files.some((f) => f.status === "downloading") ?? false;
  const allDone = share?.files.every((f) => f.status === "done") ?? false;

  return (
    <Card className="w-full max-w-md">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4">
          {/* File List View */}
          {share ? (
            <>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">
                    Key: <code className="tracking-widest">{share.key}</code>
                  </p>
                  <p className="text-xs text-neutral-400">
                    {share.files.length} file{share.files.length > 1 ? "s" : ""} ·{" "}
                    {formatFileSize(totalSize)}
                  </p>
                </div>
              </div>

              {/* File Cards */}
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {share.files.map((file) => (
                  <div
                    key={file.id}
                    className="group flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-700">
                      <div className="flex flex-col items-center">
                        {file.status === "done" ? (
                          <Check className="h-5 w-5 text-green-500" />
                        ) : file.status === "downloading" ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        ) : file.status === "error" ? (
                          <AlertCircle className="h-5 w-5 text-red-400" />
                        ) : (
                          <>
                            <FileIcon className="h-4 w-4 text-neutral-300" />
                            <span className="mt-0.5 text-[7px] font-bold text-neutral-400">
                              {getFileExtension(file.name)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {file.name}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {formatFileSize(file.size)}
                      </p>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => downloadFile(file.id)}
                      disabled={file.status === "downloading"}
                      title={file.status === "done" ? "Download again" : "Download"}
                    >
                      {file.status === "downloading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : file.status === "done" ? (
                        <Download className="h-4 w-4 text-green-500" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>

              {/* Download All */}
              {share.files.length > 1 && (
                <Button
                  onClick={downloadAll}
                  disabled={anyDownloading || downloadingAll || allDone}
                  className="w-full"
                >
                  {anyDownloading || downloadingAll ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Downloading...
                    </>
                  ) : allDone ? (
                    <>
                      <Check className="mr-2 h-4 w-4 text-green-500" />
                      All Downloaded
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download All ({share.files.length})
                    </>
                  )}
                </Button>
              )}

              <Button variant="outline" onClick={handleBack} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Enter Another Key
              </Button>
            </>
          ) : (
            /* Key Input View */
            <>
              <div className="text-center">
                <p className="text-sm text-neutral-400">
                  Enter the 6-digit key to download shared files
                </p>
              </div>

              <Input
                placeholder="Enter 6-digit key..."
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                maxLength={10}
                className="text-center text-lg font-mono tracking-widest"
              />

              {error && (
                <div className="flex items-center justify-center gap-2 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <Button
                onClick={fetchFiles}
                disabled={loading || !inputKey.trim()}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Looking up...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Retrieve Files
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
