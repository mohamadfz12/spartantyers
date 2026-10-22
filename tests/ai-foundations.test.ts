/**
 * AI foundations: the database, the settings, the gateway transport (against local mocks), the
 * spending limits, the rate limiter, visitor hashing and the retention rules. Nothing here
 * calls a real AI or touches the network; the database is PGlite in memory.
 *   npx tsx --test tests/ai-foundations.test.ts
 */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, beforeEach, describe, test } from 'node:test'

Object.assign(process.env, {
  AI_DB_MEMORY: '1',
  ADMIN_SESSION_SECRET: 'test-secret-test-secret-test-secret',
  // A non-local URL, so prices count (the practice AI costs 0); no call is ever made to it.
  AI_API_URL: 'https://gateway.example.test',
  OPENAI_API_KEY: 'test-key',
  OPENAI_CHAT_MODEL: 'test/main',
  AI_FALLBACK_MODEL: '',
  AI_DISABLED: '',
  AI_DAILY_LIMIT_USD: '',
  AI_MONTHLY_LIMIT_USD: '',
})
for (const name of ['DATABASE_URL', 'POSTGRES_URL', 'VERCEL', 'AI_PRICE_INPUT_PER_M', 'AI_PRICE_CACHED_PER_M', 'AI_PRICE_OUTPUT_PER_M']) {
  delete process.env[name]
}

const { closeAiDb, ensureAiSchema, getAiDb, aiDbConfigured, AiDbUnavailable } = await import('../api/_lib/ai/db.js')
const { DEFAULT_AI_SETTINGS, getAiSettings, getStoredAiSettings, saveAiSettings, AiSettingsError } = await import('../api/_lib/ai/settings.js')
const gateway = await import('../api/_lib/ai/gateway.js')
const spend = await import('../api/_lib/ai/spend.js')
const retention = await import('../api/_lib/ai/retention.js')
const { todaySydney } = await import('../api/_lib/ai/dates.js')
const { clientIp } = await import('../api/_lib/http.js')
const { createPracticeAi } = await import('../scripts/practice-ai.js')

const GATEWAY_ENV = ['AI_API_URL', 'OPENAI_API_KEY', 'OPENAI_CHAT_MODEL', 'AI_FALLBACK_MODEL'] as const

/** Runs `fn` with some environment variables changed, then puts them back. */
async function withEnv<T>(changes: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const before = Object.fromEntries(Object.keys(changes).map((k) => [k, process.env[k]]))
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await fn()
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

const TABLES = ['ai_calls', 'ai_messages', 'ai_conversations', 'ai_usage', 'ai_rate', 'ai_settings']

beforeEach(async () => {
  const db = await getAiDb()
  await db.query(`TRUNCATE ${TABLES.join(', ')} CASCADE`)
  for (const name of ['AI_DISABLED', 'AI_DAILY_LIMIT_USD', 'AI_MONTHLY_LIMIT_USD']) process.env[name] = ''
})

after(async () => {
  await closeAiDb()
})

/* ---------------------------------------------------------------- database */

describe('database', () => {
  test('the schema has every table and index, and creating it again changes nothing', async () => {
    const db = await getAiDb()
    await ensureAiSchema(db)
    await ensureAiSchema(db)
    const tables = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'ai\\_%'`,
    )
    assert.deepEqual(tables.map((t) => t.table_name).sort(), [...TABLES].sort())
    const indexes = await db.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename LIKE 'ai\\_%'`)
    for (const name of ['ai_usage_day_idx', 'ai_usage_day_ip_idx', 'ai_messages_conversation_idx', 'ai_calls_live_idx', 'ai_calls_conversation_idx']) {
      assert.ok(indexes.some((i) => i.indexname === name), name)
    }
  })

  test('concurrent schema creation from several instances is safe', async () => {
    const db = await getAiDb()
    await Promise.all(Array.from({ length: 6 }, () => ensureAiSchema(db)))
  })

  test('the voice columns exist from the start', async () => {
    const db = await getAiDb()
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_calls'`,
    )
    const names = cols.map((c) => c.column_name)
    for (const c of ['measured_until', 'pending', 'opened', 'monitored', 'lines', 'usage_id', 'reserve_micros', 'ends_at', 'reserved_until', 'end_reason', 'seconds']) {
      assert.ok(names.includes(c), c)
    }
  })

  test('a transaction runs its statements in order and returns each one\'s rows', async () => {
    const db = await getAiDb()
    const [a, b] = await db.transaction([
      { text: `INSERT INTO ai_rate (key, count, reset_at) VALUES ($1::text, 1, now()) RETURNING key`, params: ['t1'] },
      { text: `SELECT count FROM ai_rate WHERE key = $1::text`, params: ['t1'] },
    ])
    assert.equal(a[0].key, 't1')
    assert.equal(Number(b[0].count), 1)
  })

  test('a failing statement rolls the whole transaction back', async () => {
    const db = await getAiDb()
    await assert.rejects(
      db.transaction([
        { text: `INSERT INTO ai_rate (key, count, reset_at) VALUES ('rolled-back', 1, now())` },
        { text: `INSERT INTO no_such_table VALUES (1)` },
      ]),
    )
    assert.equal((await db.query(`SELECT 1 FROM ai_rate WHERE key = 'rolled-back'`)).length, 0)
  })

  test('on Vercel without a Postgres URL the AI has no database (never PGlite there)', async () => {
    await withEnv({ VERCEL: '1', DATABASE_URL: undefined, POSTGRES_URL: undefined }, async () => {
      assert.equal(aiDbConfigured(), false)
      await assert.rejects(getAiDb(), AiDbUnavailable)
    })
    assert.equal(aiDbConfigured(), true)
  })
})

/* ---------------------------------------------------------------- settings */

describe('settings', () => {
  test('defaults apply when nothing is saved', async () => {
    assert.deepEqual(await getAiSettings(), DEFAULT_AI_SETTINGS)
    assert.deepEqual(DEFAULT_AI_SETTINGS, { enabled: true, voiceEnabled: true, dailyLimitUsd: 5, monthlyLimitUsd: 60 })
  })

  test('a partial save keeps the other fields', async () => {
    await saveAiSettings({ dailyLimitUsd: 2.5 })
    await saveAiSettings({ voiceEnabled: false })
    assert.deepEqual(await getAiSettings(), { enabled: true, voiceEnabled: false, dailyLimitUsd: 2.5, monthlyLimitUsd: 60 })
  })

  test('limits are rounded to 2 decimals and may be 0 or 1000', async () => {
    assert.equal((await saveAiSettings({ dailyLimitUsd: 1.239 })).dailyLimitUsd, 1.24)
    assert.equal((await saveAiSettings({ dailyLimitUsd: 0 })).dailyLimitUsd, 0)
    assert.equal((await saveAiSettings({ monthlyLimitUsd: 1000 })).monthlyLimitUsd, 1000)
  })

  test('invalid values are refused and nothing is saved', async () => {
    await saveAiSettings({ dailyLimitUsd: 3 })
    for (const bad of [{ dailyLimitUsd: -1 }, { dailyLimitUsd: 1000.01 }, { monthlyLimitUsd: Number.NaN }, { monthlyLimitUsd: '5' as unknown as number }, { enabled: 'yes' as unknown as boolean }]) {
      await assert.rejects(saveAiSettings(bad), AiSettingsError)
    }
    // A valid field next to an invalid one is not half-saved.
    await assert.rejects(saveAiSettings({ enabled: false, dailyLimitUsd: -5 }), AiSettingsError)
    assert.deepEqual(await getAiSettings(), { ...DEFAULT_AI_SETTINGS, dailyLimitUsd: 3 })
  })

  test('AI_DISABLED switches everything off but keeps what was saved', async () => {
    await saveAiSettings({ dailyLimitUsd: 4 })
    await withEnv({ AI_DISABLED: '1' }, async () => {
      const s = await getAiSettings()
      assert.equal(s.enabled, false)
      assert.equal(s.voiceEnabled, false)
      assert.equal((await getStoredAiSettings()).enabled, true)
      assert.deepEqual(await spend.aiAvailable('', 'chat'), { ok: false, reason: 'off' })
      assert.deepEqual(await spend.reserve('chat', 'm', 10), { ok: false, reason: 'off' })
    })
    assert.equal((await getAiSettings()).enabled, true)
  })
})

/* ----------------------------------------------------------------- gateway */

describe('gateway', () => {
  const cfg = (url: string, key: string) => ({ url, key, model: 'm', fallbackModel: '' })

  test('the practice AI is free only for localhost or 127.0.0.1 with the key exactly "practice"', () => {
    assert.equal(gateway.isPracticeAi(cfg('http://localhost:3410', 'practice')), true)
    assert.equal(gateway.isPracticeAi(cfg('http://127.0.0.1:3410', 'practice')), true)
    assert.equal(gateway.isPracticeAi(cfg('http://localhost:3410', 'Practice')), false)
    assert.equal(gateway.isPracticeAi(cfg('http://localhost:3410', 'practice ')), false)
    assert.equal(gateway.isPracticeAi(cfg('http://localhost:3410', 'real-key')), false)
    assert.equal(gateway.isPracticeAi(cfg('https://gateway.example.test', 'practice')), false)
    assert.equal(gateway.isPracticeAi(cfg('http://localhost.evil.test', 'practice')), false)
    assert.equal(gateway.isPracticeAi(cfg('not a url', 'practice')), false)
    assert.equal(gateway.isPracticeAi(null), false)
  })

  test('the practice AI is never free on Vercel', async () => {
    await withEnv({ VERCEL: '1' }, () => {
      assert.equal(gateway.isPracticeAi(cfg('http://localhost:3410', 'practice')), false)
      assert.ok(gateway.prices(cfg('http://localhost:3410', 'practice')).output > 0)
    })
  })

  test('the practice AI costs nothing and anything else is priced', () => {
    const usage = { promptTokens: 1000, cachedTokens: 0, completionTokens: 1000 }
    assert.equal(gateway.costOf(usage, cfg('http://localhost:3410', 'practice')), 0)
    assert.equal(gateway.worstCase(10_000, 1000, cfg('http://localhost:3410', 'practice')), 0)
    assert.ok(gateway.costOf(usage, cfg('https://gateway.example.test', 'k')) > 0)
  })

  test('costOf counts cached tokens at the cached price, in whole micro-dollars', () => {
    const real = cfg('https://gateway.example.test', 'k')
    // Defaults: 0.95 input, 0.18 cached, 3 output per million tokens.
    assert.equal(gateway.costOf({ promptTokens: 1000, cachedTokens: 0, completionTokens: 0 }, real), 950)
    assert.equal(gateway.costOf({ promptTokens: 1000, cachedTokens: 1000, completionTokens: 0 }, real), 180)
    assert.equal(gateway.costOf({ promptTokens: 0, cachedTokens: 0, completionTokens: 100 }, real), 300)
    // More cached than prompt tokens cannot make the price negative.
    assert.ok(gateway.costOf({ promptTokens: 10, cachedTokens: 500, completionTokens: 0 }, real) >= 0)
  })

  test('the price defaults sit above GLM-5.2\'s real price, and AI_PRICE_* overrides them', async () => {
    const real = cfg('https://gateway.example.test', 'k')
    assert.deepEqual(gateway.prices(real), { input: 0.95, cached: 0.18, output: 3 })
    await withEnv({ AI_PRICE_INPUT_PER_M: '2', AI_PRICE_OUTPUT_PER_M: 'oops' }, () => {
      const p = gateway.prices(real)
      assert.equal(p.input, 2)
      assert.equal(p.output, 3, 'an invalid price falls back to the default')
    })
  })

  test('the fallback model has its own prices, defaulting to the main model\'s', async () => {
    const real = cfg('https://gateway.example.test', 'k')
    assert.deepEqual(gateway.prices(real, 'fallback'), gateway.prices(real, 'main'))
    await withEnv({ AI_FALLBACK_PRICE_OUTPUT_PER_M: '9' }, () => {
      assert.equal(gateway.prices(real, 'fallback').output, 9)
      assert.equal(gateway.prices(real, 'main').output, 3)
    })
  })

  test('aiConfig needs an OpenAI key, defaults to api.openai.com and gpt-4.1-mini, and trims trailing slashes', async () => {
    await withEnv({ AI_API_URL: 'https://g.example.test///', OPENAI_API_KEY: 'k', OPENAI_CHAT_MODEL: 'm' }, () => {
      assert.equal(gateway.aiConfig()?.url, 'https://g.example.test')
    })
    await withEnv({ AI_API_URL: '', OPENAI_API_KEY: 'sk-k', OPENAI_CHAT_MODEL: '' }, () => {
      assert.deepEqual(gateway.aiConfig(), { url: 'https://api.openai.com', key: 'sk-k', model: 'gpt-4.1-mini', fallbackModel: '' })
    })
    await withEnv({ AI_API_URL: '', OPENAI_API_KEY: 'practice', OPENAI_CHAT_MODEL: '' }, () => {
      const cfg = gateway.aiConfig()
      assert.equal(cfg?.url, 'http://localhost:3410')
      assert.equal(cfg?.model, 'practice/assistant')
      assert.equal(gateway.isPracticeAi(cfg), true)
    })
    await withEnv({ OPENAI_API_KEY: '' }, () => assert.equal(gateway.aiConfig(), null))
  })

  test('reasoning models get thinking room and a reasoning effort instead of a temperature', () => {
    for (const m of ['gpt-5-mini', 'gpt-5.2', 'o3', 'o4-mini']) assert.equal(gateway.isReasoningModel(m), true, m)
    for (const m of ['gpt-4.1-mini', 'gpt-4o', 'practice/assistant']) assert.equal(gateway.isReasoningModel(m), false, m)
    assert.equal(gateway.outputAllowance('gpt-4.1-mini', 450), 450)
    assert.equal(gateway.outputAllowance('gpt-5-mini', 450), 2450)
  })

  test('canFallBack only for a timeout or a server error, before any answer, with a different model', () => {
    const base = { url: 'u', key: 'k', model: 'main', fallbackModel: 'other' }
    const timeout = new gateway.AiError('timeout', 't', 0, true)
    assert.equal(gateway.canFallBack(timeout, base), true)
    assert.equal(gateway.canFallBack(new gateway.AiError('http', 'h', 503), base), true)
    assert.equal(gateway.canFallBack(new gateway.AiError('http', 'h', 400), base), false)
    assert.equal(gateway.canFallBack(timeout, base, true), false)
    assert.equal(gateway.canFallBack(timeout, { ...base, fallbackModel: '' }), false)
    assert.equal(gateway.canFallBack(timeout, { ...base, fallbackModel: 'main' }), false)
    assert.equal(gateway.canFallBack(new Error('x'), base), false)
  })

  describe('complete() against a local mock gateway', () => {
    let server: Server
    let last: { auth: string; body: Record<string, any> } | null = null
    let mode: 'stream' | 'error' | 'hang' | 'cutoff' = 'stream'

    const start = async () => {
      server = createServer(async (req, res) => {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        last = { auth: String(req.headers.authorization), body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
        if (mode === 'error') {
          res.writeHead(503)
          return res.end('{"error":{"message":"echoed sk-secret-key"}}')
        }
        if (mode === 'hang') return
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const send = (d: unknown) => res.write(`data: ${JSON.stringify(d)}\n\n`)
        send({ choices: [{ index: 0, delta: { content: 'Hel' } }] })
        send({ choices: [{ index: 0, delta: { content: 'lo' } }] })
        if (mode === 'cutoff') return void setTimeout(() => res.destroy(), 50)
        send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'find_tyres', arguments: '{"a"' } }] } }] })
        send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: ':1}' } }] } }] })
        send({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
        send({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 20 } } })
        res.end('data: [DONE]\n\n')
      })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, key: 'real-key', model: 'test/main', fallbackModel: '' }
    }
    after(() => new Promise((r) => server?.close(r)))

    test('streams text, joins tool-call pieces, reads usage and sends the right request', async () => {
      mode = 'stream'
      const config = await start()
      const seen: string[] = []
      const out = await gateway.complete({
        config,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [{ type: 'function', function: { name: 'find_tyres', description: 'd', parameters: { type: 'object' } } }],
        maxTokens: 50,
        onText: (t) => seen.push(t),
      })
      assert.equal(out.text, 'Hello')
      assert.deepEqual(seen, ['Hel', 'lo'])
      assert.deepEqual(out.toolCalls, [{ id: 'c1', name: 'find_tyres', arguments: '{"a":1}' }])
      assert.deepEqual(out.usage, { promptTokens: 120, cachedTokens: 20, completionTokens: 30 })
      assert.equal(out.finishReason, 'tool_calls')
      assert.equal(last?.auth, 'Bearer real-key')
      assert.equal(last?.body.chat_template_kwargs, undefined)
      assert.equal(last?.body.stream, true)
      assert.equal(last?.body.model, 'test/main')
      assert.equal(last?.body.max_completion_tokens, 50)
      assert.equal(last?.body.tool_choice, 'auto')
    })

    test('an explicit model overrides the configured one', async () => {
      mode = 'stream'
      const config = { ...(await withUrl()), model: 'test/main' }
      await gateway.complete({ config, model: 'test/other', messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 })
      assert.equal(last?.body.model, 'test/other')
    })

    test('a reasoning model is sent a reasoning effort and thinking room, and no temperature', async () => {
      mode = 'stream'
      const config = { ...(await withUrl()), model: 'gpt-5-mini' }
      await gateway.complete({ config, messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 })
      assert.equal(last?.body.temperature, undefined)
      assert.equal(last?.body.reasoning_effort, 'low')
      assert.equal(last?.body.max_completion_tokens, 2010)
    })

    const withUrl = async () => ({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, key: 'real-key', model: 'm', fallbackModel: '' })

    test('an error status becomes an AiError that never repeats the response body', async () => {
      mode = 'error'
      const config = await withUrl()
      await assert.rejects(
        gateway.complete({ config, messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }),
        (err: unknown) => {
          assert.ok(err instanceof gateway.AiError)
          assert.equal(err.reason, 'http')
          assert.equal(err.status, 503)
          assert.equal(err.billable, false)
          assert.ok(!err.message.includes('sk-secret-key'))
          return true
        },
      )
    })

    test('a call that does not answer in time is a billable timeout', async () => {
      mode = 'hang'
      const config = await withUrl()
      await assert.rejects(
        gateway.complete({ config, timeoutMs: 150, messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }),
        (err: unknown) => err instanceof gateway.AiError && err.reason === 'timeout' && err.billable === true,
      )
    })

    test('an answer cut off half way is a billable network error', async () => {
      mode = 'cutoff'
      const config = await withUrl()
      await assert.rejects(
        gateway.complete({ config, messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }),
        (err: unknown) => err instanceof gateway.AiError && err.reason === 'network' && err.billable === true,
      )
    })

    test('without a gateway configured the call is refused before any request', async () => {
      await withEnv({ OPENAI_API_KEY: '' }, () =>
        assert.rejects(
          gateway.complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 10 }),
          (err: unknown) => err instanceof gateway.AiError && err.reason === 'not_configured',
        ),
      )
    })
  })

  test('the practice AI streams an answer and usage, and prices it at zero', async () => {
    const practice = createPracticeAi()
    await new Promise<void>((r) => practice.listen(0, '127.0.0.1', r))
    try {
      const config = { url: `http://127.0.0.1:${(practice.address() as AddressInfo).port}`, key: 'practice', model: 'practice/assistant', fallbackModel: '' }
      const out = await gateway.complete({ config, messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'hello' }], maxTokens: 100 })
      assert.match(out.text, /Spartan Tyres/)
      assert.ok(out.usage && out.usage.promptTokens > 0 && out.usage.completionTokens > 0)
      assert.equal(gateway.costOf(out.usage, config), 0)
      const bad = await fetch(`${config.url}/v1/other`)
      assert.equal(bad.status, 404)
    } finally {
      await new Promise((r) => practice.close(r))
    }
  })
})

/* -------------------------------------------------------------- visitors */

describe('visitor hashing', () => {
  test('the hash never contains the raw address and is short and stable', () => {
    const h = spend.hashIp('203.0.113.45')
    assert.ok(h.length > 10 && h.length <= 22)
    assert.ok(!h.includes('203') && !h.includes('113.45'))
    assert.equal(h, spend.hashIp('203.0.113.45'))
  })

  test('addresses on the same /24 (IPv4) or /64 (IPv6) share a hash, other networks do not', () => {
    assert.equal(spend.hashIp('203.0.113.1'), spend.hashIp('203.0.113.250'))
    assert.notEqual(spend.hashIp('203.0.113.1'), spend.hashIp('203.0.114.1'))
    assert.equal(spend.hashIp('2001:db8:1:2::1'), spend.hashIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'))
    assert.notEqual(spend.hashIp('2001:db8:1:2::1'), spend.hashIp('2001:db8:1:3::1'))
    assert.equal(spend.hashIp('::ffff:203.0.113.9'), spend.hashIp('203.0.113.9'))
    assert.notEqual(spend.hashIp('203.0.113.1'), spend.hashIp('2001:db8:1:2::1'))
  })

  test('networkOf names the block', () => {
    assert.equal(spend.networkOf('203.0.113.45'), '203.0.113.0/24')
    assert.equal(spend.networkOf('2001:0db8:0001:0002:0000:0000:0000:0001'), '2001:db8:1:2::/64')
    assert.equal(spend.networkOf('2001:db8::1'), '2001:db8:0:0::/64')
  })

  test('the key is ADMIN_SESSION_SECRET: another secret gives another hash', async () => {
    const a = spend.hashIp('203.0.113.45')
    const b = await withEnv({ ADMIN_SESSION_SECRET: 'a-different-secret-a-different-secret' }, () => spend.hashIp('203.0.113.45'))
    assert.notEqual(a, b)
  })

  test('an unknown address has no hash', () => {
    assert.equal(spend.hashIp(''), '')
    assert.equal(spend.hashIp('unknown'), '')
  })

  test('on Vercel without ADMIN_SESSION_SECRET there is no key: hashing throws and the AI is off', async () => {
    await withEnv({ VERCEL: '1', ADMIN_SESSION_SECRET: undefined, DATABASE_URL: 'postgres://x.invalid/db' }, async () => {
      assert.equal(spend.visitorKeyConfigured(), false)
      assert.throws(() => spend.hashIp('203.0.113.45'))
      assert.deepEqual(await spend.aiAvailable('', 'chat'), { ok: false, reason: 'not_configured' })
    })
  })

  test('off Vercel a missing secret falls back to a development key (never in production)', async () => {
    await withEnv({ ADMIN_SESSION_SECRET: undefined }, () => {
      assert.equal(spend.visitorKeyConfigured(), true)
      assert.ok(spend.hashIp('203.0.113.45'))
    })
    await withEnv({ ADMIN_SESSION_SECRET: undefined, NODE_ENV: 'production' }, () => {
      assert.equal(spend.visitorKeyConfigured(), false)
    })
  })

  test('clientIp reads the first x-forwarded-for value, then x-real-ip', () => {
    assert.equal(clientIp({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } }), '203.0.113.5')
    assert.equal(clientIp({ headers: { 'x-forwarded-for': ['203.0.113.6'] } }), '203.0.113.6')
    assert.equal(clientIp({ headers: { 'x-real-ip': '203.0.113.7' } }), '203.0.113.7')
    assert.equal(clientIp({ headers: {} }), '')
  })
})

/* ------------------------------------------------------------------ spend */

describe('spending', () => {
  const USD = 1_000_000
  const rowsOf = async () => (await getAiDb()).query<{ cost_micros: number; status: string; day: string; ip_hash: string; prompt_tokens: number }>(`SELECT * FROM ai_usage ORDER BY created_at, id`)

  test('effective limits are the lower of the setting and the environment cap', async () => {
    const s = { dailyLimitUsd: 5, monthlyLimitUsd: 60 }
    assert.deepEqual(spend.effectiveLimits(s), { dailyUsd: 5, monthlyUsd: 60 })
    await withEnv({ AI_DAILY_LIMIT_USD: '0.5', AI_MONTHLY_LIMIT_USD: '0.75' }, () => {
      assert.deepEqual(spend.effectiveLimits(s), { dailyUsd: 0.5, monthlyUsd: 0.75 })
    })
    await withEnv({ AI_DAILY_LIMIT_USD: '999', AI_MONTHLY_LIMIT_USD: 'x' }, () => {
      assert.deepEqual(spend.effectiveLimits(s), { dailyUsd: 5, monthlyUsd: 60 }, 'a higher or invalid cap never raises a limit')
    })
  })

  test('a visitor may use a fifth of the daily limit, at least 20 cents', () => {
    assert.equal(spend.visitorShare(5), 1)
    assert.equal(spend.visitorShare(0.5), 0.2)
    assert.equal(spend.visitorShare(100), 20)
  })

  test('reserve books the worst case, settle replaces it with the measured cost', async () => {
    const r = await spend.reserve('chat', 'test/main', 50_000, 'visitor-a')
    assert.ok(r.ok)
    let [row] = await rowsOf()
    assert.equal(row.status, 'reserved')
    assert.equal(Number(row.cost_micros), 50_000)
    assert.equal(row.day, todaySydney())
    assert.equal(row.ip_hash, 'visitor-a')

    await spend.settle(r.id, { promptTokens: 1000, cachedTokens: 0, completionTokens: 100 }, 'done')
    ;[row] = await rowsOf()
    assert.equal(row.status, 'settled')
    assert.equal(Number(row.cost_micros), 950 + 300)
    assert.equal(Number(row.prompt_tokens), 1000)
  })

  test('a billed call keeps its worst case, a free one costs nothing', async () => {
    const a = await spend.reserve('chat', 'm', 40_000)
    const b = await spend.reserve('chat', 'm', 30_000)
    assert.ok(a.ok && b.ok)
    await spend.settle(a.id, null, 'billed')
    await spend.settle(b.id, null, 'free')
    const rows = await rowsOf()
    assert.deepEqual(rows.map((r) => Number(r.cost_micros)).sort((x, y) => x - y), [0, 40_000])
    assert.ok(rows.every((r) => r.status === 'settled'))
  })

  test('a done call with no usage reported keeps the worst case', async () => {
    const r = await spend.reserve('chat', 'm', 12_345)
    assert.ok(r.ok)
    await spend.settle(r.id, null, 'done')
    assert.equal(Number((await rowsOf())[0].cost_micros), 12_345)
  })

  test('the practice AI settles at zero', async () => {
    await withEnv({ AI_API_URL: 'http://localhost:3410', OPENAI_API_KEY: 'practice' }, async () => {
      const r = await spend.reserve('chat', 'practice/assistant', 0)
      assert.ok(r.ok)
      await spend.settle(r.id, { promptTokens: 5000, cachedTokens: 0, completionTokens: 5000 }, 'done')
      assert.equal(Number((await rowsOf())[0].cost_micros), 0)
    })
  })

  test('the daily limit refuses a reservation that would cross it, and allows one that reaches it', async () => {
    await saveAiSettings({ dailyLimitUsd: 1, monthlyLimitUsd: 100 })
    assert.ok((await spend.reserve('chat', 'm', 600_000)).ok)
    assert.deepEqual(await spend.reserve('chat', 'm', 500_000), { ok: false, reason: 'daily' })
    assert.ok((await spend.reserve('chat', 'm', 400_000)).ok, 'exactly reaching the limit is allowed')
    assert.deepEqual(await spend.reserve('chat', 'm', 1), { ok: false, reason: 'daily' })
    assert.equal((await rowsOf()).length, 2, 'a refused reservation books nothing')
  })

  test('the monthly limit counts earlier days of the month', async () => {
    await saveAiSettings({ dailyLimitUsd: 100, monthlyLimitUsd: 1 })
    const today = todaySydney()
    const firstOfMonth = `${today.slice(0, 7)}-01`
    const db = await getAiDb()
    // Spend from the first of the month (a different day when today is not the 1st) and from last month.
    await db.query(`INSERT INTO ai_usage (day, purpose, model, cost_micros, status) VALUES ($1, 'chat', 'm', 700000, 'settled')`, [firstOfMonth === today ? today : firstOfMonth])
    await db.query(`INSERT INTO ai_usage (day, purpose, model, cost_micros, status) VALUES ('2000-01-15', 'chat', 'm', 9000000, 'settled')`)
    assert.deepEqual(await spend.reserve('chat', 'm', 400_000), { ok: false, reason: 'monthly' })
    assert.ok((await spend.reserve('chat', 'm', 300_000)).ok, 'an old month does not count')
  })

  test('one visitor may use only their share; other visitors are not affected', async () => {
    await saveAiSettings({ dailyLimitUsd: 5, monthlyLimitUsd: 100 }) // share: $1
    assert.ok((await spend.reserve('chat', 'm', 900_000, 'visitor-a')).ok)
    assert.deepEqual(await spend.reserve('chat', 'm', 200_000, 'visitor-a'), { ok: false, reason: 'visitor' })
    assert.ok((await spend.reserve('chat', 'm', 900_000, 'visitor-b')).ok)
    assert.ok((await spend.reserve('chat', 'm', 900_000, '')).ok, 'an unknown visitor has no share')
  })

  test('the environment caps lower the admin settings', async () => {
    await saveAiSettings({ dailyLimitUsd: 50, monthlyLimitUsd: 500 })
    await withEnv({ AI_DAILY_LIMIT_USD: '0.5' }, async () => {
      assert.ok((await spend.reserve('chat', 'm', 400_000)).ok)
      assert.deepEqual(await spend.reserve('chat', 'm', 200_000), { ok: false, reason: 'daily' })
    })
    await withEnv({ AI_MONTHLY_LIMIT_USD: '0.45' }, async () => {
      assert.deepEqual(await spend.reserve('chat', 'm', 100_000), { ok: false, reason: 'monthly' })
    })
  })

  test('many reservations at the same moment cannot overspend', async () => {
    await saveAiSettings({ dailyLimitUsd: 3, monthlyLimitUsd: 1000 })
    const results = await Promise.all(Array.from({ length: 12 }, () => spend.reserve('chat', 'm', USD)))
    assert.equal(results.filter((r) => r.ok).length, 3)
    assert.equal(results.filter((r) => !r.ok).length, 9)
    const total = (await rowsOf()).reduce((sum, r) => sum + Number(r.cost_micros), 0)
    assert.equal(total, 3 * USD)
  })

  test('chat and voice reservations count each other, and voice has its own switch', async () => {
    await saveAiSettings({ dailyLimitUsd: 1, monthlyLimitUsd: 100 })
    const [chat, voice] = await Promise.all([spend.reserve('chat', 'm', 700_000), spend.reserve('voice', 'v', 700_000)])
    assert.equal([chat, voice].filter((r) => r.ok).length, 1)
    await saveAiSettings({ voiceEnabled: false, dailyLimitUsd: 100 })
    assert.deepEqual(await spend.reserve('voice', 'v', 1), { ok: false, reason: 'off' })
    assert.ok((await spend.reserve('chat', 'm', 1)).ok)
  })

  test('aiAvailable books nothing and says why it cannot answer', async () => {
    assert.deepEqual(await spend.aiAvailable('visitor-a'), { ok: true })
    assert.equal((await rowsOf()).length, 0)

    await withEnv({ OPENAI_API_KEY: '' }, async () => {
      assert.deepEqual(await spend.aiAvailable('', 'chat'), { ok: false, reason: 'not_configured' })
      // Voice is checked by its own code (voiceConfig): here only the switches and the limits count.
      assert.deepEqual(await spend.aiAvailable('', 'voice'), { ok: true })
    })

    await saveAiSettings({ enabled: false })
    assert.deepEqual(await spend.aiAvailable(), { ok: false, reason: 'off' })
    await saveAiSettings({ enabled: true, voiceEnabled: false })
    assert.deepEqual(await spend.aiAvailable('', 'voice'), { ok: false, reason: 'off' })
    assert.deepEqual(await spend.aiAvailable('', 'chat'), { ok: true })

    await saveAiSettings({ voiceEnabled: true, dailyLimitUsd: 1, monthlyLimitUsd: 100 })
    await spend.reserve('chat', 'm', USD, '')
    assert.deepEqual(await spend.aiAvailable(), { ok: false, reason: 'daily' }, 'a day that has reached its limit is unavailable')
  })

  test('spentUsd reports dollars for today and the month', async () => {
    await spend.reserve('chat', 'm', 250_000)
    const s = await spend.spentUsd()
    assert.equal(s.today, 0.25)
    assert.equal(s.month, 0.25)
  })

  test('settleMicros writes the exact cost, clamped to a sane range', async () => {
    const r = await spend.reserve('voice', 'v', 100_000)
    assert.ok(r.ok)
    await spend.settleMicros(r.id, 123_456.4, { promptTokens: 1, cachedTokens: 0, completionTokens: 2 })
    assert.equal(Number((await rowsOf())[0].cost_micros), 123_456)
    await spend.settleMicros(r.id, -5, { promptTokens: 0, cachedTokens: 0, completionTokens: 0 })
    assert.equal(Number((await rowsOf())[0].cost_micros), 0)
  })
})

/* ------------------------------------------------------------ rate limit */

describe('rate limiting', () => {
  test('allows the limit, then refuses the next hit', async () => {
    const results = []
    for (let i = 0; i < 5; i++) results.push(await spend.rateLimited('chat:a', 3, 60))
    assert.deepEqual(results, [false, false, false, true, true])
  })

  test('keys are counted separately', async () => {
    for (let i = 0; i < 3; i++) await spend.rateLimited('chat:a', 3, 60)
    assert.equal(await spend.rateLimited('chat:a', 3, 60), true)
    assert.equal(await spend.rateLimited('chat:b', 3, 60), false)
  })

  test('the window resets once it has passed', async () => {
    for (let i = 0; i < 4; i++) await spend.rateLimited('chat:a', 3, 60)
    assert.equal(await spend.rateLimited('chat:a', 3, 60), true)
    await (await getAiDb()).query(`UPDATE ai_rate SET reset_at = now() - interval '1 second' WHERE key = 'chat:a'`)
    assert.equal(await spend.rateLimited('chat:a', 3, 60), false, 'first hit of a new window')
    const [row] = await (await getAiDb()).query<{ count: number }>(`SELECT count FROM ai_rate WHERE key = 'chat:a'`)
    assert.equal(Number(row.count), 1)
  })

  test('hits at the same moment are counted exactly', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => spend.rateLimited('burst', 4, 60)))
    assert.equal(results.filter((limited) => limited).length, 6)
  })
})

/* -------------------------------------------------------------- retention */

describe('retention', () => {
  const DAY = 86_400_000
  const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

  async function conversation(id: string, lastDaysAgo: number, orderRef: string | null = null, ipHash = '') {
    const db = await getAiDb()
    await db.query(`INSERT INTO ai_conversations (id, ip_hash, started_at, last_at, order_ref) VALUES ($1, $2, $3::timestamptz, $3::timestamptz, $4)`, [id, ipHash, ago(lastDaysAgo), orderRef])
    await db.query(`INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'user', 'hello')`, [id])
    await db.query(`INSERT INTO ai_calls (id, conversation_id, started_at, ends_at, ip_hash) VALUES ($1, $2, $3::timestamptz, now(), $4)`, [`call-${id}`, id, ago(lastDaysAgo), ipHash])
  }
  const ids = async (table: string, col = 'id') => (await (await getAiDb()).query<Record<string, string>>(`SELECT ${col} AS v FROM ${table} ORDER BY 1`)).map((r) => r.v)

  test('chats older than 30 days go, with their messages and calls; newer ones stay', async () => {
    await conversation('old', 31)
    await conversation('recent', 29)
    const result = await retention.purgeAi()
    assert.deepEqual(await ids('ai_conversations'), ['recent'])
    assert.deepEqual(await ids('ai_messages', 'conversation_id'), ['recent'])
    assert.deepEqual(await ids('ai_calls', 'conversation_id'), ['recent'])
    assert.equal(result.conversations, 1)
  })

  test('chats linked to an order are kept for 2 years', async () => {
    await conversation('ordered-1y', 365, 'ORDER-1')
    await conversation('ordered-3y', 3 * 365, 'ORDER-2')
    await conversation('plain-1y', 365)
    await retention.purgeAi()
    assert.deepEqual(await ids('ai_conversations'), ['ordered-1y'])
  })

  test('settled spending older than 400 days goes; newer and unsettled rows stay', async () => {
    const db = await getAiDb()
    const row = (status: string, days: number) =>
      db.query(`INSERT INTO ai_usage (day, purpose, model, cost_micros, status, created_at) VALUES ('2025-01-01', 'chat', $1, 5, $2, $3::timestamptz)`, [`${status}-${days}`, status, ago(days)])
    await row('settled', 401)
    await row('settled', 399)
    await row('reserved', 401)
    const result = await retention.purgeAi()
    assert.deepEqual(await ids('ai_usage', 'model'), ['reserved-401', 'settled-399'])
    assert.equal(result.usageRows, 1)
  })

  test('expired rate-limit windows go; live ones stay', async () => {
    const db = await getAiDb()
    await db.query(`INSERT INTO ai_rate (key, count, reset_at) VALUES ('expired', 1, now() - interval '1 minute'), ('live', 1, now() + interval '1 minute')`)
    const result = await retention.purgeAi()
    assert.deepEqual(await ids('ai_rate', 'key'), ['live'])
    assert.equal(result.rateWindows, 1)
  })

  test('hashed visitor ids are blanked after 35 days, and not before', async () => {
    await conversation('a', 34, 'ORDER-A', 'hash-a')
    await conversation('b', 20, null, 'hash-b')
    const db = await getAiDb()
    await db.query(`INSERT INTO ai_usage (day, purpose, model, ip_hash, status, created_at) VALUES ('2026-01-01', 'chat', 'm', 'hash-u', 'reserved', $1::timestamptz)`, [ago(36)])
    await retention.purgeAi()
    assert.deepEqual(await ids('ai_usage', 'ip_hash'), [''])
    assert.deepEqual(await ids('ai_conversations', 'ip_hash'), ['hash-a', 'hash-b'])
    // A chat linked to an order outlives 30 days; past 35 days its hashed id is blanked.
    await db.query(`UPDATE ai_conversations SET last_at = $1::timestamptz WHERE id = 'a'`, [ago(40)])
    await db.query(`UPDATE ai_calls SET started_at = $1::timestamptz WHERE conversation_id = 'a'`, [ago(40)])
    await retention.purgeAi()
    assert.deepEqual(await ids('ai_conversations', 'ip_hash'), ['', 'hash-b'])
    assert.deepEqual(await ids('ai_calls', 'ip_hash'), ['', 'hash-b'].sort())
  })

  test('purging with nothing to do is harmless and idempotent', async () => {
    assert.deepEqual(await retention.purgeAi(), { conversations: 0, usageRows: 0, rateWindows: 0, ipsBlanked: 0 })
    assert.deepEqual(await retention.purgeAi(), { conversations: 0, usageRows: 0, rateWindows: 0, ipsBlanked: 0 })
  })

  test('maybePurgeAi runs at most once a day and hands the work to waitUntil', async () => {
    await conversation('old', 40)
    const handed: Promise<unknown>[] = []
    assert.equal(await retention.maybePurgeAi((p) => handed.push(p)), true)
    assert.equal(handed.length, 1)
    await handed[0]
    assert.deepEqual(await ids('ai_conversations'), [])

    await conversation('old2', 40)
    assert.equal(await retention.maybePurgeAi((p) => handed.push(p)), false, 'already ran today')
    assert.equal(handed.length, 1)
    assert.deepEqual(await ids('ai_conversations'), ['old2'])

    // A day later it runs again.
    await (await getAiDb()).query(`UPDATE ai_rate SET reset_at = now() - interval '1 second' WHERE key = 'purge:daily'`)
    const again: Promise<unknown>[] = []
    assert.equal(await retention.maybePurgeAi((p) => again.push(p)), true)
    await Promise.all(again)
  })

  test('maybePurgeAi claims once even when many requests ask together', async () => {
    const work: Promise<unknown>[] = []
    const claims = await Promise.all(Array.from({ length: 8 }, () => retention.maybePurgeAi((p) => work.push(p))))
    assert.equal(claims.filter(Boolean).length, 1)
    await Promise.all(work)
  })

  test('maybePurgeAi never throws, even when the database is unavailable', async () => {
    await withEnv({ VERCEL: '1', DATABASE_URL: undefined, POSTGRES_URL: undefined }, async () => {
      assert.equal(await retention.maybePurgeAi(), false)
    })
  })
})

/* ============================================= shared helpers, and the tracer guard */

describe('the helpers the AI files share live in one place', () => {
  test('metaOf reads jsonb however the database engine hands it over', async () => {
    const { metaOf } = await import('../api/_lib/ai/util.js')
    assert.deepEqual(metaOf({ a: 1 }), { a: 1 })
    assert.deepEqual(metaOf('{"a":1}'), { a: 1 })
    assert.deepEqual(metaOf('"{\\"a\\":1}"'), { a: 1 }, 'text inside text')
    for (const bad of [null, undefined, 5, [], '[1]', 'not json', '']) assert.deepEqual(metaOf(bad), {}, String(bad))
  })

  test('cap reads an environment limit: a number of zero or more, otherwise none', async () => {
    const { cap } = await import('../api/_lib/ai/util.js')
    assert.equal(cap('2'), 2)
    assert.equal(cap('0'), 0)
    assert.equal(cap('1.5'), 1.5)
    for (const bad of [undefined, '', '  ', '-1', 'abc', 'Infinity']) assert.equal(cap(bad), null, String(bad))
  })

  test('each helper is written once under api/ (a second copy could drift)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(import.meta.dirname, '..', 'api')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.ts$/.test(entry.name)) files.push(path)
      }
    }
    walk(root)
    const count = (pattern: RegExp) => files.filter((f) => pattern.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length).replace(/\\/g, '/'))
    assert.deepEqual(count(/const metaOf\b/), ['/_lib/ai/util.ts'])
    assert.deepEqual(count(/const obj = \(v: unknown\)/), [])
    assert.deepEqual(count(/const cap = \(/), ['/_lib/ai/util.ts'])
    assert.deepEqual(count(/function cleanPage|const cleanPage/), [])
  })

  test('PGlite is loaded through a function parameter, so the file tracer never follows it into a function', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(import.meta.dirname, '..', 'api/_lib/ai/db.ts'), 'utf8')
    assert.match(source, /const loadModule = \(name: string\) => import\(name\)/)
    assert.match(source, /loadModule\('@electric-sql\/pglite'\)/)
    // No import() of a literal or of a constant holding the name (those are traced).
    assert.equal(/import\(\s*['"`]@electric-sql\/pglite/.test(source), false)
    assert.equal(/const specifier\b/.test(source), false)
    assert.equal(/from ['"]@electric-sql\/pglite/.test(source), false)
    assert.equal(/tracer (skips|never bundles)/.test(source), false, 'the old, false comment is gone')
  })
})
