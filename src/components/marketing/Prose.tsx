import { useMemo } from 'react'
import { Quote } from 'lucide-react'
import { cn, slugify } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * Markdown-lite renderer
 *
 * The blog bodies in src/data/blog.ts use exactly four constructs and
 * nothing else:
 *
 *   `## `   a second-level heading
 *   `- `    a bullet; consecutive bullet lines form one list
 *   `> `    a callout; consecutive quote lines form one callout
 *           blank-line separated runs of text are paragraphs
 *
 * So this is a small deterministic parser rather than a markdown
 * dependency. Inline emphasis is deliberately unsupported: the source
 * content does not use it, and pretending otherwise would invite
 * dangerouslySetInnerHTML into the page.
 * ------------------------------------------------------------------ */

type Block =
  | { kind: 'heading'; text: string; id: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'paragraph'; lines: string[] }

export function parseProse(body: string): Block[] {
  const blocks: Block[] = []

  let paragraph: string[] = []
  let list: string[] = []
  let quote: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', lines: paragraph })
      paragraph = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push({ kind: 'list', items: list })
      list = []
    }
  }
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ kind: 'quote', lines: quote })
      quote = []
    }
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (const raw of body.split('\n')) {
    const line = raw.trim()

    if (!line) {
      flushAll()
      continue
    }

    if (line.startsWith('## ')) {
      flushAll()
      const text = line.slice(3).trim()
      blocks.push({ kind: 'heading', text, id: slugify(text) })
      continue
    }

    if (line.startsWith('- ')) {
      flushParagraph()
      flushQuote()
      list.push(line.slice(2).trim())
      continue
    }

    if (line.startsWith('> ')) {
      flushParagraph()
      flushList()
      quote.push(line.slice(2).trim())
      continue
    }

    // Plain text: a run of these separated by blank lines is a paragraph.
    flushList()
    flushQuote()
    paragraph.push(line)
  }

  flushAll()
  return blocks
}

/** The headings in a body, for an on-page contents list. */
export function proseHeadings(body: string): Array<{ text: string; id: string }> {
  return parseProse(body)
    .filter((block): block is Extract<Block, { kind: 'heading' }> => block.kind === 'heading')
    .map(({ text, id }) => ({ text, id }))
}

export function Prose({
  body,
  className,
}: {
  body: string
  className?: string
}) {
  const blocks = useMemo(() => parseProse(body), [body])

  return (
    <div className={cn('max-w-none', className)}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return (
              <h2
                key={index}
                id={block.id}
                className="mt-12 scroll-mt-28 font-heading text-xl font-extrabold uppercase leading-tight tracking-tight text-foreground first:mt-0 sm:text-2xl"
              >
                {block.text}
              </h2>
            )

          case 'list':
            return (
              <ul key={index} className="mt-6 flex flex-col gap-3">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    />
                    <span className="text-base leading-relaxed text-muted-foreground">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            )

          case 'quote':
            return (
              <blockquote
                key={index}
                className="relative mt-8 overflow-hidden rounded-lg border border-primary/25 bg-primary/[0.06] p-5 md:p-6"
              >
                <Quote
                  aria-hidden="true"
                  className="absolute right-4 top-4 h-8 w-8 text-primary/20"
                />
                <div className="relative flex flex-col gap-3">
                  {block.lines.map((line, lineIndex) => (
                    <p
                      key={lineIndex}
                      className="pr-8 text-base font-medium leading-relaxed text-foreground"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </blockquote>
            )

          case 'paragraph':
          default:
            return (
              <p
                key={index}
                className="mt-6 text-base leading-[1.75] text-muted-foreground"
              >
                {block.lines.join(' ')}
              </p>
            )
        }
      })}
    </div>
  )
}
