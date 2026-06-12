import { NextResponse } from "next/server";

export async function POST(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return NextResponse.json({ name, starred: true });
}
