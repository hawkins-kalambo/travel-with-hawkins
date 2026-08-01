import type { NextRequest } from "next/server";
import { handleInitializeRequest } from "@/lib/payments/initialize-handler";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleInitializeRequest(req, "transport_fare");
}
