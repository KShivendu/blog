import '@/css/tailwind.css'
import '@/css/prism.css'
import 'katex/dist/katex.css'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import Head from 'next/head'

import siteMetadata from '@/data/siteMetadata'
import Analytics from '@/components/analytics'
import LayoutWrapper from '@/components/LayoutWrapper'
import { ClientReload } from '@/components/ClientReload'
import { Analytics as VercelAnalytics } from '@vercel/analytics/react'

const isDevelopment = process.env.NODE_ENV === 'development'
const isSocket = process.env.SOCKET

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Enable smooth scrolling only after the page (images, charts, fonts)
    // has fully settled, so in-page navigation (TOC, back-to-top, etc.)
    // animates, but a refresh/direct-load with a #hash doesn't: the
    // browser's own scroll-to-fragment, and any re-adjustment it makes
    // while async content below the target is still loading in, both stay
    // instant. A couple of animation frames isn't enough of a buffer, this
    // page's interactive charts/images keep shifting layout well past that.
    let timeoutId
    const enable = () => {
      timeoutId = setTimeout(() => {
        document.documentElement.classList.add('scroll-smooth')
      }, 1000)
    }
    if (document.readyState === 'complete') {
      enable()
    } else {
      window.addEventListener('load', enable, { once: true })
    }
    return () => {
      window.removeEventListener('load', enable)
      clearTimeout(timeoutId)
    }
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme={siteMetadata.theme}>
      <Head>
        <meta content="width=device-width, initial-scale=1" name="viewport" />
      </Head>
      {isDevelopment && isSocket && <ClientReload />}
      <Analytics />
      <VercelAnalytics />
      <LayoutWrapper>
        <Component {...pageProps} />
      </LayoutWrapper>
    </ThemeProvider>
  )
}
