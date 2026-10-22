/**
 * Runs the Vercel functions in `api/` on your machine, the way Vercel does, so `npm run dev`
 * can serve the whole site and Vite can proxy `/api` to it.
 *
 *   npm run dev:api     on http://localhost:3110 (API_PORT); npm run dev starts it too
 *
 * Routing follows Vercel: `/api/inventory` is `api/inventory.ts`, `/api/promo/validate` is
 * `api/promo/validate.ts`, and `api/admin/[action].ts` answers `/api/admin/<anything>` with
 * the segment in `req.query.action`. A static file wins over a `[param]` file, `_lib` is
 * never a route. Handlers get a request with `method`, `query`, `body` and `headers`, and a
 * response with `status()`, `json()`, `setHeader()`, `end()`, `write()` and `flushHeaders()`.
 *
 * It runs under `tsx watch`, which restarts the process when a handler or anything it
 * imports changes, so edits apply without a manual restart. Only the method, the path and
 * the status are logged, never a body or a query string.
 */
import http from 'node:http'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type Query = Record<string, string | string[]>
type HandlerFn = (req: unknown, res: unknown) => unknown

export interface Route {
  /** Absolute path of the function file */
  file: string
  /** The `[param]` segments matched, by name */
  params: Record<string, string>
}

const EXTENSIONS = ['.ts', '.js']

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory()

/** The function file for `segments` under `dir`, preferring a static name over a `[param]`, or null. */
function resolveIn(dir: string, segments: string[], params: Record<string, string>): Route | null {
  const [head, ...rest] = segments
  if (!head || head.startsWith('_') || head.startsWith('.') || !isDir(dir)) return null

  // Candidates in order: the literal name first, then each [param] entry.
  const candidates: { stem: string; found: Record<string, string> }[] = [{ stem: head, found: {} }]
  for (const entry of readdirSync(dir)) {
    const match = /^\[([^\]]+)\](?:\.(?:ts|js))?$/.exec(entry)
    if (match) candidates.push({ stem: `[${match[1]}]`, found: { [match[1]]: head } })
  }

  for (const { stem, found } of candidates) {
    const next = { ...params, ...found }
    if (rest.length === 0) {
      for (const ext of EXTENSIONS) {
        const file = path.join(dir, `${stem}${ext}`)
        if (existsSync(file) && statSync(file).isFile()) return { file, params: next }
      }
    } else {
      const deeper = resolveIn(path.join(dir, stem), rest, next)
      if (deeper) return deeper
    }
  }
  return null
}

/** Maps a URL pathname such as `/api/promo/validate` to its function file, or null. */
export function resolveRoute(pathname: string, apiDir: string): Route | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'api') return null
  let decoded: string[]
  try {
    decoded = segments.slice(1).map(decodeURIComponent)
  } catch {
    return null
  }
  // Never let a decoded segment climb out of the api folder or name a file by extension.
  if (decoded.some((s) => s.includes('/') || s.includes('\\') || s === '..' || s === '.')) return null
  return resolveIn(apiDir, decoded, {})
}

/** The query string as Vercel gives it: a string, or an array when a name repeats. */
function parseQuery(search: URLSearchParams): Query {
  const query: Query = {}
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }
  return query
}

async function readRaw(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/** The response object handlers see: Vercel's `status()` and `json()` on top of Node's response. */
function wrapResponse(res: http.ServerResponse) {
  const wrapped = {
    status(code: number) {
      res.statusCode = code
      return wrapped
    },
    json(body: unknown) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
    },
    setHeader(key: string, value: string) {
      res.setHeader(key, value)
    },
    end() {
      res.end()
    },
    write(chunk: string) {
      return res.write(chunk)
    },
    flushHeaders() {
      res.flushHeaders()
    },
    on(event: 'close', listener: () => void) {
      return res.on(event, listener)
    },
    get headersSent() {
      return res.headersSent
    },
    get writableEnded() {
      return res.writableEnded
    },
    get destroyed() {
      return res.destroyed
    },
  }
  return wrapped
}

const handlers = new Map<string, Promise<HandlerFn>>()

/** Loads a function once per process; `tsx watch` restarts the process when its code changes. */
function loadHandler(file: string): Promise<HandlerFn> {
  let loaded = handlers.get(file)
  if (!loaded) {
    loaded = import(pathToFileURL(file).href).then((mod) => {
      if (typeof mod.default !== 'function') throw new Error('has no default export')
      return mod.default as HandlerFn
    })
    handlers.set(file, loaded)
    loaded.catch(() => handlers.delete(file))
  }
  return loaded
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

export interface DevApiOptions {
  /** The folder of functions; default `api/` next to this script's parent */
  apiDir?: string
  /** Log one line per request (default true) */
  log?: boolean
}

/** The local API server (not yet listening). */
export function createDevApi(options: DevApiOptions = {}): http.Server {
  const apiDir =
    options.apiDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'api')
  const log = options.log ?? true

  return http.createServer(async (req, res) => {
    const started = Date.now()
    const method = (req.method ?? 'GET').toUpperCase()
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (log) {
      res.on('finish', () => {
        console.log(`${method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started}ms)`)
      })
    }

    try {
      const route = resolveRoute(url.pathname, apiDir)
      if (!route) return sendJson(res, 404, { error: 'No such API route.' })

      const query: Query = { ...parseQuery(url.searchParams), ...route.params }

      // Vercel parses JSON for us and leaves anything else as the raw string; GET has no body.
      let body: unknown
      if (method !== 'GET' && method !== 'HEAD') {
        const raw = await readRaw(req)
        if (raw) {
          body = String(req.headers['content-type'] ?? '').toLowerCase().includes('application/json')
            ? safeJson(raw)
            : raw
        }
      }

      // Vercel sets this from the connection, so a caller cannot choose its own address.
      const headers: http.IncomingHttpHeaders = {
        ...req.headers,
        'x-forwarded-for': req.socket.remoteAddress ?? '',
      }

      const handler = await loadHandler(route.file)
      await handler({ method, query, body, headers }, wrapResponse(res))
      if (!res.writableEnded) res.end()
    } catch (error) {
      console.error('[dev-api] handler error:', error instanceof Error ? error.message : 'unknown error')
      if (res.headersSent) res.end()
      else sendJson(res, 500, { error: 'Something went wrong on our end. Please try again.' })
    }
  })
}

/** Parsed JSON, or the raw text when it is not valid (the handler's `readBody` then returns null). */
function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/dev-api.ts')) {
  const port = Number(process.env.API_PORT || 3110)
  createDevApi()
    .on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`  API  port ${port} is already in use`)
        process.exit(1)
      }
      throw err
    })
    .listen(port, () => console.log(`  API  http://localhost:${port}   (the functions in api/)`))
}
