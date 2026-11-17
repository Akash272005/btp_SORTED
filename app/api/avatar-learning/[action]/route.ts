import { NextResponse } from "next/server"

const tutorApi = (process.env.AI_TUTOR_API_URL || "http://127.0.0.1:8001").replace(/\/+$/, "")
const avatarVoiceUrl = process.env.AVATAR_F5_TTS_URL
const actions = new Map([
  ["chapters", "/api/v1/avatar-learning/chapters"],
  ["lesson", "/api/v1/avatar-learning/lesson"],
  ["question", "/api/v1/avatar-learning/question"],
  ["quiz", "/api/v1/avatar-learning/quiz"],
  ["narration", "/api/v1/tts/synthesize"],
])

type RouteContext = { params: Promise<{ action: string }> }

async function forward(request: Request, action: string) {
  const endpoint = actions.get(action)
  if (!endpoint || (request.method === "GET") !== (action === "chapters")) {
    return NextResponse.json({ error: "Unknown lesson action." }, { status: 404 })
  }

  let body: string | undefined
  if (request.method === "POST") {
    if (Number(request.headers.get("content-length")) > 100_000) {
      return NextResponse.json({ error: "The lesson request is too large." }, { status: 413 })
    }
    body = await request.text()
    if (body.length > 100_000) {
      return NextResponse.json({ error: "The lesson request is too large." }, { status: 413 })
    }
  }

  try {
    let destination = `${tutorApi}${endpoint}`
    let method = request.method
    if (action === "narration" && avatarVoiceUrl) {
      const narration = JSON.parse(body || "{}")
      if (typeof narration?.text !== "string" || !narration.text.trim() || narration.text.length > 2000 ||
          !["en", "hi"].includes(narration.language)) {
        return NextResponse.json({ error: "Invalid narration request." }, { status: 400 })
      }
      const voice = new URL("/listen", avatarVoiceUrl)
      voice.searchParams.set("text", narration.text)
      voice.searchParams.set("language", narration.language)
      destination = voice.toString()
      method = "GET"
      body = undefined
    }

    const upstream = await fetch(destination, {
      method,
      body,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
    })
    if (!upstream.ok) {
      const response = await upstream.json().catch(() => null)
      const error = action !== "narration" && typeof response?.detail === "string" && (upstream.status < 500 || upstream.status === 502)
        ? response.detail
        : action === "narration"
          ? "The teacher’s voice is unavailable. You can still read the narration."
          : "The Tutor couldn’t complete this request. Try again in a moment."
      return NextResponse.json({ error }, { status: upstream.status })
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json(
      { error: action === "narration"
        ? "The teacher’s voice is unavailable. You can still read the narration."
        : "The AI Tutor is unavailable. Check that it is running and try again." },
      { status: 503 },
    )
  }
}

export async function GET(request: Request, context: RouteContext) {
  return forward(request, (await context.params).action)
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, (await context.params).action)
}
