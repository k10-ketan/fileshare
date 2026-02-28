import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { customAlphabet } from "nanoid";
import { addShare, getUploadsDir } from "@/lib/store";
import type { FileEntry } from "@/lib/store";

const MAX_SIZE = 500 * 1024 * 1024; // 500MB per file
const generateKey = customAlphabet("0123456789", 6);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    // Validate all files first
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `"${file.name}" exceeds 500MB limit` },
          { status: 413 }
        );
      }
    }

    const uploadsDir = getUploadsDir();
    await mkdir(uploadsDir, { recursive: true });

    // Generate one key for all files
    const key = generateKey();
    const fileEntries: FileEntry[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file.name);
      const safeFileName = `${key}_${i}_${Date.now()}${ext}`;
      const filePath = path.join(uploadsDir, safeFileName);

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filePath, buffer);

      fileEntries.push({
        id: i,
        filePath,
        originalName: file.name,
        size: file.size,
      });
    }

    // Store all files under one key
    addShare(key, {
      files: fileEntries,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      key,
      fileCount: files.length,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
