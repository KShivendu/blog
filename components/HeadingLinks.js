import { useEffect, useRef } from 'react'

/*
 * HeadingLinks — click an in-article heading to copy a deep link to it.
 *
 * Headings already carry ids (rehype-slug). This attaches a click handler to
 * h2/h3 (and h1 if present) inside .prose-tty: copies `…/slug#heading-id` to the
 * clipboard, updates the address bar hash (no scroll jump), and flashes a small
 * terminal-styled "link copied" toast. A hover `#` affordance signals it's
 * clickable. Keyboard users still have the rehype-autolink anchor.
 */
export default function HeadingLinks() {
  const toastRef = useRef(null)

  useEffect(() => {
    const prose = document.querySelector('.prose-tty')
    if (!prose) return
    const headings = [...prose.querySelectorAll('h1[id], h2[id], h3[id]')]

    const showToast = () => {
      const t = toastRef.current
      if (!t) return
      t.style.opacity = '1'
      t.style.transform = 'translate(-50%, 0)'
      clearTimeout(t._timer)
      t._timer = setTimeout(() => {
        t.style.opacity = '0'
        t.style.transform = 'translate(-50%, 8px)'
      }, 1500)
    }

    const bound = []
    headings.forEach((h) => {
      h.classList.add('tty-anchor-h')
      const onClick = (e) => {
        // Let genuine links inside a heading behave normally.
        const a = e.target.closest('a')
        if (a && !a.getAttribute('href')?.startsWith('#')) return
        const url = `${location.origin}${location.pathname}#${h.id}`
        try {
          navigator.clipboard?.writeText(url)
        } catch (err) {
          /* clipboard blocked — still update hash below */
        }
        history.replaceState(null, '', `#${h.id}`)
        showToast()
      }
      h.addEventListener('click', onClick)
      bound.push([h, onClick])
    })

    return () => bound.forEach(([h, fn]) => h.removeEventListener('click', fn))
  }, [])

  return (
    <div
      ref={toastRef}
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '28px',
        transform: 'translate(-50%, 8px)',
        zIndex: 90,
        pointerEvents: 'none',
        background: 'var(--tty-bg)',
        color: 'var(--tty-accent)',
        border: '1px solid var(--tty-accent)',
        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        fontSize: '12.5px',
        padding: '7px 13px',
        borderRadius: '2px',
        opacity: 0,
        transition: 'opacity 0.14s ease, transform 0.14s ease',
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
      }}
    >
      ✓ link copied
    </div>
  )
}
