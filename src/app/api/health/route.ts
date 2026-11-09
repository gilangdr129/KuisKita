import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "kuiskita",
    phase: "F0",
    time: new Date().toISOString(),
  });
}
