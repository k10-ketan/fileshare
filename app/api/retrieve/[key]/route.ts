import { NextRequest, NextResponse } from "next/server";
import { getShare } from "@/lib/store";

// GET /api/retrieve/[key] → returns list of files for this key
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    const share = getShare(key);
    if (!share) {
      return NextResponse.json(
        { error: "File not found or expired" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      key,
      createdAt: share.createdAt,
      files: share.files.map((f) => ({
        id: f.id,
        name: f.originalName,
        size: f.size,
      })),
    });
  } catch (error) {
    console.error("Retrieve error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve files" },
      { status: 500 }
    );
  }
}
