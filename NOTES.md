# Notes

## og:image WhatsApp rendering

**Problem:** `why-search.png` wasn't rendering as a link preview in WhatsApp, while `exa-clean.jpg` worked.

**Root cause: file size.** WhatsApp drops link previews for images over ~300KB. PNG is uncompressed compared to JPEG, so even a visually similar image can be 10x larger.

- `why-search.png` — 606KB (failed)
- `why-search.jpg` — 48KB (converted, should work)
- `exa-clean.jpg` — 802KB (works, but borderline — may fail on slower connections)

**Fix:** Convert to JPEG at quality 85:

```bash
convert image.png -quality 85 image.jpg
```

**What doesn't matter:**

- Dimensions: WhatsApp only requires 100x100 minimum. 1200x600 vs 1200x630 is irrelevant.
- PNG vs JPG format: both are supported. The size difference is what kills it.

**WhatsApp og:image rules (2026):**

- Min dimensions: 100x100px
- Recommended: 1200x630px
- File size: keep under 300KB for reliable previews; above 600KB previews often fail
- Formats: JPG, PNG, WebP (JPG most reliable)
- Must be an absolute URL (not a relative path) in the meta tag
