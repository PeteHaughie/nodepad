import { NextRequest, NextResponse } from "next/server"

const DEFAULT_OLLAMA = process.env.OLLAMA_BASE_URL || "http://localhost:11434"

function isLocalHost(raw: string) {
  try {
    const u = new URL(raw)
    const h = u.hostname.toLowerCase()
    return h === "localhost" || h === "127.0.0.1" || h === "::1"
  } catch {
    return false
  }
}

async function fetchModelsFrom(base: string) {
  const tryUrls = [
    `${base.replace(/\/+$/, "")}/v1/models`,
    `${base.replace(/\/+$/, "")}/models`,
  ]
  for (const url of tryUrls) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const text = await res.text()
      try {
        const json = JSON.parse(text)
        // Ollama may return an array or an object with `models` or `data`.
        if (Array.isArray(json)) return json
        if (json && Array.isArray(json.models)) return json.models
        if (json && Array.isArray(json.data)) return json.data
        // Fallback: if it's an object with numeric-keyed items, try to map values
        if (json && typeof json === "object") {
          const vals = Object.values(json).filter(v => Array.isArray(v)).flat() as any[]
          if (vals.length > 0) return vals
        }
        return []
      } catch {
        continue
      }
    } catch {
      continue
    }
  }
  return []
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const provided = (body?.baseUrl as string) || DEFAULT_OLLAMA
    if (!provided) return NextResponse.json({ models: [] })

    // Do not allow arbitrary remote hosts in production — limit to local dev.
    if (!isLocalHost(provided) && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Remote baseUrl not allowed" }, { status: 400 })
    }

    const models = await fetchModelsFrom(provided)
    return NextResponse.json({ models })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 502 })
  }
}
