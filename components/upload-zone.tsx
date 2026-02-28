"use client";

import React, { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import {
  Upload,
  FileIcon,
  X,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  Plus,
} from "lucide-react";

export default function UploadZone() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadKey, setUploadKey] = useState<string | null>(null);
  const [uploadedFileCount, setUploadedFileCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_SIZE = 500 * 1024 * 1024;

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError(null);
      const toAdd: File[] = [];
      for (const f of Array.from(newFiles)) {
        if (f.size > MAX_SIZE) {
          setError(`"${f.name}" exceeds 500MB limit and was skipped.`);
          continue;
        }
        toAdd.push(f);
      }
      setFiles((prev) => [...prev, ...toAdd]);
    },
    [MAX_SIZE]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        addFiles(e.target.files);
      }
      if (inputRef.current) inputRef.current.value = "";
    },
    [addFiles]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const result = await new Promise<{ key: string; fileCount: number }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/upload-file");

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded / e.total) * 100));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              try {
                const err = JSON.parse(xhr.responseText);
                reject(new Error(err.error || "Upload failed"));
              } catch {
                reject(new Error("Upload failed"));
              }
            }
          };

          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(formData);
        }
      );

      setUploadKey(result.key);
      setUploadedFileCount(result.fileCount);
      setProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCopy = async () => {
    if (!uploadKey) return;
    try {
      await navigator.clipboard.writeText(uploadKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for clipboard API failure
      const textArea = document.createElement("textarea");
      textArea.value = uploadKey;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setUploadKey(null);
    setUploadedFileCount(0);
    setError(null);
    setProgress(0);
    setCopied(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const getFileExtension = (name: string) => {
    const ext = name.split(".").pop()?.toUpperCase() || "FILE";
    return ext.length > 5 ? ext.slice(0, 5) : ext;
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <Card className="w-full max-w-md">
      <CardContent className="p-6">
        {/* Success State — single key for all files */}
        {uploadKey ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">
                {uploadedFileCount === 1
                  ? "File Uploaded!"
                  : `${uploadedFileCount} Files Uploaded!`}
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                Share this key to let others download your{" "}
                {uploadedFileCount === 1 ? "file" : "files"}
              </p>
            </div>

            {/* Single key display */}
            <div
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg bg-neutral-800 p-4 transition-colors hover:bg-neutral-750"
              onClick={handleCopy}
            >
              <code className="flex-1 text-center text-3xl font-bold tracking-[0.3em] text-white">
                {uploadKey}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
              </Button>
            </div>

            {copied && (
              <p className="text-xs font-medium text-green-500">
                Key copied to clipboard!
              </p>
            )}

            <p className="text-xs text-neutral-500">Expires in 24 hours</p>

            <Button
              variant="outline"
              onClick={handleReset}
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Upload More Files
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragActive
                  ? "border-white bg-neutral-800"
                  : "border-neutral-700 hover:border-neutral-500 hover:bg-neutral-800/50"
              }`}
            >
              <Upload className="h-10 w-10 text-neutral-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-white">
                  Drag & drop files here
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  or click to browse · Multiple files · Max 500MB each
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-neutral-400">
                    {files.length} file{files.length > 1 ? "s" : ""} ·{" "}
                    {formatFileSize(totalSize)}
                  </p>
                  {!uploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        inputRef.current?.click();
                      }}
                      className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add more
                    </button>
                  )}
                </div>

                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="group relative flex items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800/50 p-3"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-700">
                        <div className="flex flex-col items-center">
                          <FileIcon className="h-4 w-4 text-neutral-300" />
                          <span className="mt-0.5 text-[7px] font-bold text-neutral-400">
                            {getFileExtension(file.name)}
                          </span>
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
                      {!uploading && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 text-red-400 hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          title="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {uploading && (
              <div className="w-full">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-xs text-neutral-400">
                  {progress}% uploaded
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="text-center text-sm text-red-400">{error}</p>
            )}

            {/* Upload Button */}
            {files.length > 0 && !uploading && (
              <Button onClick={handleUpload} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                Upload {files.length === 1 ? "File" : `${files.length} Files`}
              </Button>
            )}

            {uploading && (
              <Button disabled className="w-full">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
