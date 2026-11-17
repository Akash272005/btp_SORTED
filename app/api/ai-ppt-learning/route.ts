import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

const maxFileSize = 15 * 1024 * 1024
const tutorApi = (process.env.AI_TUTOR_API_URL || "http://127.0.0.1:8001").replace(/\/+$/, "")
const deckIdPattern = /^cmc-ppt-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/

function tutorUnavailable() {
  return NextResponse.json(
    { error: "The AI Tutor is unavailable. Check that its services are running and try again." },
    { status: 503 },
  )
}

export async function POST(request: Request) {
  const requestSize = Number(request.headers.get("content-length"))
  if (requestSize > maxFileSize + 64 * 1024) {
    return NextResponse.json({ error: "Choose a PowerPoint file under 15 MB." }, { status: 413 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File) || !/\.pptx$/i.test(file.name) || !file.size) {
    return NextResponse.json({ error: "Choose a PowerPoint (.pptx) file." }, { status: 400 })
  }
  if (file.size > maxFileSize) {
    return NextResponse.json({ error: "Choose a PowerPoint file under 15 MB." }, { status: 413 })
  }

  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (header.length !== 4 || header[0] !== 80 || header[1] !== 75 || header[2] !== 3 || header[3] !== 4) {
    return NextResponse.json({ error: "This file could not be opened as a PowerPoint presentation." }, { status: 400 })
  }

  const deckId = `cmc-ppt-${randomUUID()}`
  const title = file.name.slice(0, -5).replace(/[^\p{L}\p{N} _-]/gu, "_").trim().slice(0, 48) || "Presentation"
  const upload = new FormData()
  upload.set("name", deckId)
  upload.set("rag_provider", "raganything_docling")
  upload.set("files", file, `${title}.pptx`)

  try {
    const response = await fetch(`${tutorApi}/api/v1/knowledge/create`, {
      method: "POST",
      body: upload,
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    })
    if (!response.ok) {
      return NextResponse.json({ error: "The AI Tutor could not start processing this presentation." }, { status: 502 })
    }
    return NextResponse.json({ deckId }, { status: 202 })
  } catch {
    return tutorUnavailable()
  }
}

export async function GET(request: Request) {
  const deckId = new URL(request.url).searchParams.get("deck")
  if (!deckId || !deckIdPattern.test(deckId)) {
    return NextResponse.json({ error: "Invalid presentation ID." }, { status: 400 })
  }

  try {
    const response = await fetch(`${tutorApi}/api/v1/knowledge/${deckId}/progress`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    })
    if (!response.ok) return tutorUnavailable()

    const progress = await response.json()
    const stage = progress.stage || progress.status
    if (stage === "completed") return NextResponse.json({ status: "ready" })
    if (stage === "error") return NextResponse.json({ status: "failed" })
    if (stage === "not_started") {
      return NextResponse.json({ error: "This presentation could not be found. Upload it again." }, { status: 404 })
    }
    return NextResponse.json({ status: "processing" })
  } catch {
    return tutorUnavailable()
  }
}
