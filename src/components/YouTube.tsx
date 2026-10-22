import { useState } from 'react'
import { Play } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ *
 * A YouTube video that plays on this site.
 *
 * Until it is clicked it is only the video's thumbnail and a play
 * button: no YouTube scripts, cookies or player weight on page load.
 * Clicking swaps in the player from youtube-nocookie.com (YouTube's
 * privacy-enhanced mode) and starts it, so the visitor never leaves.
 * ------------------------------------------------------------------ */

export function YouTube({
  id,
  title,
  start,
  className,
}: {
  /** The 11-character video id. */
  id: string
  title: string
  /** Seconds to start from. */
  start?: number
  className?: string
}) {
  const [playing, setPlaying] = useState(false)
  const params = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', playsinline: '1' })
  if (start) params.set('start', String(start))

  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-lift', className)}>
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params.toString()}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 h-full w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary"
          aria-label={`Play video: ${title}`}
        >
          <img
            src={`https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift transition-transform duration-300 group-hover:scale-110 sm:h-20 sm:w-20">
            <Play aria-hidden="true" className="ml-1 h-7 w-7 fill-current sm:h-9 sm:w-9" />
          </span>
          <span className="absolute inset-x-0 bottom-0 p-4 text-left font-heading text-sm font-bold text-white sm:text-base">
            {title}
          </span>
        </button>
      )}
    </div>
  )
}
