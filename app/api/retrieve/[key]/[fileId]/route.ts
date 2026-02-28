import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync } from "fs";
import { stat } from "fs/promises";
import { getShare } from "@/lib/store";

// GET /api/retrieve/[key]/[fileId] → download individual file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string; fileId: string }> }
) {
  try {
    const { key, fileId } = await params;
    const id = parseInt(fileId, 10);

    const share = getShare(key);
    if (!share) {
      return NextResponse.json(
        { error: "File not found or expired" },
        { status: 404 }
      );
    }

    const file = share.files.find((f) => f.id === id);
    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    if (!existsSync(file.filePath)) {
      return NextResponse.json(
        { error: "File not found on server" },
        { status: 404 }
      );
    }

    const fileStat = await stat(file.filePath);

    const stream = createReadStream(file.filePath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on("data", (chunk) => {
          controller.enqueue(new Uint8Array(Buffer.from(chunk)));
        });
        stream.on("end", () => {
          controller.close();
        });
        stream.on("error", (err) => {
          controller.error(err);
        });
      },
      cancel() {
        stream.destroy();
      },
    });

    const encodedName = encodeURIComponent(file.originalName);

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "Content-Length": fileStat.size.toString(),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download file" },
      { status: 500 }
    );
  }
}
