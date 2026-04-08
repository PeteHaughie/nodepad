import { NextRequest, NextResponse } from "next/server"

const DEFAULT_OLLAMA = process.env.OLLAMA_BASE_URL || "http://localhost:11434"

async function forwardToOllama(body: any, forwardAuth?: string) {
  const base = DEFAULT_OLLAMA.replace(/\/+$/, "")
  const tryEndpoints = [`${base}/v1/chat/completions`, `${base}/chat/completions`]

  // Try to fetch available models and ensure the requested model exists.
  try {
    const mres = await fetch(`${base}/v1/models`)
    if (mres.ok) {
      const txt = await mres.text()
      try {
        const json = JSON.parse(txt)
        const list = Array.isArray(json) ? json : json.models ?? json.data ?? []
        const ids = (list || []).map((m: any) => m?.id || m?.model || String(m))
        if (ids.length > 0 && body && body.model && !ids.includes(body.model)) {
          // Replace with the first available model to avoid 400s from Ollama
          body.model = ids[0]
        }
      } catch {
        // ignore parse failures
      }
    }
  } catch {
    // ignore errors fetching models — we'll try the completions endpoints directly
  }

  let lastErr: unknown = null
  for (const ep of tryEndpoints) {
    try {
      const res = await fetch(ep, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(forwardAuth ? { Authorization: forwardAuth } : {}),
        },
        body: JSON.stringify(body),
      })
      // Return successful or error response as JSON/text caller can handle
      const text = await res.text()
      try {
        return { ok: res.ok, status: res.status, json: JSON.parse(text) }
      } catch {
        return { ok: res.ok, status: res.status, text }
      }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error("No endpoints reachable")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const forwardAuth = req.headers.get("authorization") || undefined
    const result = await forwardToOllama(body, forwardAuth)
    if (result.json) return NextResponse.json(result.json, { status: result.status })
    if (result.text) return new NextResponse(result.text, { status: result.status })
    return NextResponse.json({ error: "Unknown response from Ollama" }, { status: 502 })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 502 })
  }
}
