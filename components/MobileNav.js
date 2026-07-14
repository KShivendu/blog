import { useState } from 'react'
import Link from './Link'
import ThemeSwitch from './ThemeSwitch'
import headerNavLinks from '@/data/headerNavLinks'

const MobileNav = () => {
  const [navShow, setNavShow] = useState(false)

  const onToggleNav = () => {
    setNavShow((status) => {
      document.body.style.overflow = status ? 'auto' : 'hidden'
      return !status
    })
  }

  return (
    <div className="sm:hidden">
      <button
        type="button"
        className="ml-1 mr-1 h-8 w-8 rounded py-1"
        aria-label="Toggle Menu"
        onClick={onToggleNav}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="text-gray-900 dark:text-gray-100"
        >
          <path
            fillRule="evenodd"
            d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Full-screen, fully-opaque terminal-style menu. Background set inline —
          the bg-[var(--tty-bg)] arbitrary class isn't emitted reliably. */}
      <div
        style={{ background: 'var(--tty-bg)' }}
        className={`fixed inset-0 z-50 transform transition-transform duration-200 ease-in-out ${
          navShow ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Top bar: path label + theme toggle + close, mirrors the site header. */}
        <div
          style={{ borderBottom: '1px solid var(--tty-border)' }}
          className="flex items-center justify-end px-4 py-4"
        >
          <div className="flex items-center gap-1">
            <ThemeSwitch />
            <button
              type="button"
              aria-label="Close Menu"
              onClick={onToggleNav}
              className="flex h-9 w-9 items-center justify-center text-gray-900 dark:text-gray-100"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-6 w-6"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Nav rows: hairline separators, accent prompt marker, large tap targets. */}
        <nav className="px-2 pt-2">
          {headerNavLinks.map((link) => (
            <Link
              key={link.title}
              href={link.href}
              onClick={onToggleNav}
              style={{ borderBottom: '1px solid var(--tty-hair)' }}
              className="flex items-center gap-3 px-4 py-5 text-xl text-gray-900 hover:text-primary-500 dark:text-gray-100 dark:hover:text-primary-400"
            >
              <span
                className="select-none text-primary-500 dark:text-primary-400"
                aria-hidden="true"
              >
                ›
              </span>
              {link.title}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

export default MobileNav
