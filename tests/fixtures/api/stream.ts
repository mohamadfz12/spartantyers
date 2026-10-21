/** Test function: streams three server-sent events using write() and flushHeaders(). */
export default async function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.flushHeaders()
  for (const n of [1, 2, 3]) {
    res.write(`data: ${n}\n\n`)
    await new Promise((r) => setTimeout(r, 20))
  }
  res.end()
}
