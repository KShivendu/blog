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
    // Enable smooth scrolling only after the initial load (and its
    // browser-native, instant jump-to-hash-on-refresh) has settled, so
    // in-page navigation (TOC, back-to-top, etc.) animates but a
    // refresh/direct-load with a #hash doesn't.
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.add('scroll-smooth')
      })
    })
    return () => cancelAnimationFrame(id)
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
