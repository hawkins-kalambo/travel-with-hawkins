import { NextResponse } from "next/server";

export function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
}
