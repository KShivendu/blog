// Dynamic Open Graph image endpoint (Node serverless — Next 12.0.9 has no edge
// runtime). Renders a 1200x630 social card on the fly from `title` + `type`
// query params and returns a PNG. Nothing is stored; the CDN caches the result
// for a year (immutable) since a given URL always yields the same image.
//
//   /api/og?title=Some+Post+Title&subtitle=optional+deck&type=post
//   /api/og?type=default
import { renderOgPng } from '@/lib/og-card'

// eslint-disable-next-line import/no-anonymous-default-export
export default async function handler(req, res) {
  try {
    const { title, subtitle, type } = req.query
    const png = await renderOgPng({
      title: Array.isArray(title) ? title[0] : title,
      subtitle: Array.isArray(subtitle) ? subtitle[0] : subtitle,
      type: (Array.isArray(type) ? type[0] : type) === 'post' ? 'post' : 'default',
    })

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable')
    res.status(200).send(png)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('OG image generation failed:', err)
    res.status(500).json({ error: 'Failed to generate OG image' })
  }
}
