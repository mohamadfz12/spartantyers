/**
 * The local API server (scripts/dev-api.ts): routing of static and dynamic files, query and
 * body parsing, the address header, streaming and error handling. It runs against the small
 * functions in tests/fixtures/api, on a random port, with no network.
 *   npx tsx --test tests/dev-api.test.ts
 */
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createDevApi, resolveRoute } from '../scripts/dev-api.js'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'api')

let server: Server
let base = ''

before(async () => {
  server = createDevApi({ apiDir: fixtures, log: false })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const json = async (res: Response) => ({ status: res.status, body: await res.json() })

test('a static file is served at its path', async () => {
  const { status, body } = await json(await fetch(`${base}/api/echo`))
  assert.equal(status, 200)
  assert.equal(body.method, 'GET')
})

test('a [param] file answers any segment and puts it in req.query', async () => {
  const { body } = await json(await fetch(`${base}/api/items/abc-123`))
  assert.deepEqual(body, { route: 'dynamic', id: 'abc-123' })
})

test('a static file wins over a [param] file in the same folder', async () => {
  const { body } = await json(await fetch(`${base}/api/items/featured`))
  assert.deepEqual(body, { route: 'static' })
})

test('the query string is parsed, and repeated names become arrays', async () => {
  const { body } = await json(await fetch(`${base}/api/echo?a=1&tag=x&tag=y&name=Jo%20Smith`))
  assert.deepEqual(body.query, { a: '1', tag: ['x', 'y'], name: 'Jo Smith' })
})

test('a [param] value is merged into req.query beside the query string', async () => {
  const { body } = await json(await fetch(`${base}/api/items/7?x=1`))
  assert.equal(body.id, '7')
})

test('a JSON body is parsed into req.body', async () => {
  const { body } = await json(
    await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi', n: 2 }),
    }),
  )
  assert.equal(body.method, 'POST')
  assert.deepEqual(body.body, { message: 'hi', n: 2 })
})

test('any other content type arrives as the raw string', async () => {
  const { body } = await json(
    await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{"message":"hi"}',
    }),
  )
  assert.equal(body.body, '{"message":"hi"}')
})

test('a JSON body that does not parse arrives as the raw string, for readBody to refuse', async () => {
  const { body } = await json(
    await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    }),
  )
  assert.equal(body.body, '{not json')
})

test('a GET request has no body', async () => {
  const { body } = await json(await fetch(`${base}/api/echo`))
  assert.equal(body.body, '__none__')
})

test('x-forwarded-for comes from the socket, whatever the caller sends', async () => {
  const { body } = await json(
    await fetch(`${base}/api/echo`, { headers: { 'x-forwarded-for': '6.6.6.6' } }),
  )
  assert.match(body.forwardedFor, /127\.0\.0\.1/)
})

test('write() and flushHeaders() stream server-sent events', async () => {
  const res = await fetch(`${base}/api/stream`)
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
  assert.equal(await res.text(), 'data: 1\n\ndata: 2\n\ndata: 3\n\n')
})

test('unknown paths answer 404 as { error }', async () => {
  for (const url of ['/api/nope', '/api/items/a/b', '/other', '/api']) {
    const { status, body } = await json(await fetch(`${base}${url}`))
    assert.equal(status, 404, url)
    assert.equal(typeof body.error, 'string', url)
  }
})

test('_lib is never a route', async () => {
  assert.equal((await fetch(`${base}/api/_lib/hidden`)).status, 404)
  assert.equal(resolveRoute('/api/_lib/hidden', fixtures), null)
})

test('a path that tries to leave the api folder is refused', async () => {
  assert.equal(resolveRoute('/api/..%2Fecho', fixtures), null)
  assert.equal(resolveRoute('/api/%2e%2e/echo', fixtures), null)
})

test('a handler that throws answers a generic 500 without its message', async () => {
  const res = await fetch(`${base}/api/boom`)
  const text = await res.text()
  assert.equal(res.status, 500)
  assert.ok(!text.includes('secret detail'))
  assert.equal(typeof JSON.parse(text).error, 'string')
})

test('resolveRoute maps real routes of this site', () => {
  const real = path.resolve(fixtures, '..', '..', '..', 'api')
  assert.ok(resolveRoute('/api/inventory', real)?.file.endsWith('inventory.ts'))
  assert.ok(resolveRoute('/api/promo/validate', real)?.file.endsWith('validate.ts'))
  const admin = resolveRoute('/api/admin/stats', real)
  assert.ok(admin?.file.endsWith('[action].ts'))
  assert.equal(admin?.params.action, 'stats')
})
