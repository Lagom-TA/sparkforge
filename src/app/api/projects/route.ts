import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects, NotAuthorizedError } from "@/lib/projects";
import { getOrCreateGuestSession } from "@/lib/guest";

export async function GET() {
  try {
    await getOrCreateGuestSession();
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    if (err instanceof NotAuthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof Error && err.message === "SUPABASE_NOT_CONFIGURED") {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; initialPrompt?: string };
    if (!body.initialPrompt?.trim()) {
      return NextResponse.json({ error: "MISSING_PROMPT" }, { status: 400 });
    }
    await getOrCreateGuestSession();
    const project = await createProject({
      name: body.name?.trim() || body.initialPrompt.trim().slice(0, 40),
      initialPrompt: body.initialPrompt.trim(),
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (err instanceof NotAuthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof Error && err.message === "SUPABASE_NOT_CONFIGURED") {
      return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED" }, { status: 503 });
    }
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
