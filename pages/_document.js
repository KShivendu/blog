import Document, { Html, Head, Main, NextScript } from 'next/document'
class MyDocument extends Document {
  render() {
    return (
      <Html lang="en" className="scroll-smooth">
        <Head>
          <link rel="icon" href="/static/favicons/favicon.svg" type="image/svg+xml" />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/static/favicons/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/static/favicons/favicon-32x32.png"
          />
          {/* <!-- Cloudflare Web Analytics: ToDo use React/Nextjs lib instead? --> */}
          {/* <script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "be7b2031ad25466087430ac11fccadff"}'></script> */}
          {/* <!-- End Cloudflare Web Analytics --> */}
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/static/favicons/favicon-16x16.png"
          />
          <link rel="manifest" href="/static/favicons/site.webmanifest" />
          <link rel="mask-icon" href="/static/favicons/safari-pinned-tab.svg" color="#047857" />
          <meta name="msapplication-TileColor" content="#047857" />
          <meta name="theme-color" content="#047857" />
          <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
        </Head>
        <body className="antialiased">
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument
