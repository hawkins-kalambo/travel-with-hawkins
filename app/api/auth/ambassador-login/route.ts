import type { NextRequest } from "next/server";
import { handleAmbassadorLogin } from "@/lib/staffLogin";

export async function POST(req: NextRequest) {
  return handleAmbassadorLogin(req);
}
