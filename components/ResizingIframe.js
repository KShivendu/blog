/* eslint-disable jsx-a11y/iframe-has-title */
import { useEffect, useRef, useState } from 'react'

// Embeds a standalone interactive HTML and auto-sizes to its content height
// (the interactive postMessages { type: 'ifh', height }). Matching the height to
// the content means there is no internal scrollbar, so page scroll never gets trapped.
export default function ResizingIframe({ src, title, min = 360 }) {
  const ref = useRef(null)
  const [h, setH] = useState(min)
  useEffect(() => {
    function onMsg(e) {
      if (
        e.data &&
        e.data.type === 'ifh' &&
        ref.current &&
        e.source === ref.current.contentWindow &&
        typeof e.data.height === 'number'
      ) {
        setH(Math.max(min, Math.ceil(e.data.height)))
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [min])
  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      loading="lazy"
      scrolling="no"
      style={{
        width: '100%',
        height: h + 'px',
        border: 'none',
        borderRadius: '10px',
        display: 'block',
      }}
    />
  )
}
