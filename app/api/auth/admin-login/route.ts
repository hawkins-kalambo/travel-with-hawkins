import type { NextRequest } from "next/server";
import { handleAdminLogin } from "@/lib/staffLogin";

export async function POST(req: NextRequest) {
  return handleAdminLogin(req);
}
