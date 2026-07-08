import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

export default function PlotlyChart({ data, layout, config, style, frames, src }) {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme) === 'dark'

  // Optional: load {data, layout} from an external JSON instead of inline props.
  const [fetched, setFetched] = useState(null)
  useEffect(() => {
    if (!src) return
    let live = true
    fetch(src)
      .then((r) => r.json())
      .then((j) => live && setFetched(j))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [src])
  if (src && !fetched) return <div style={{ minHeight: 320, margin: '1.5rem 0' }} />
  const chartData = src ? fetched.data : data
  const chartLayout = src ? fetched.layout : layout

  const fontColor = isDark ? '#e2e8f0' : '#1e293b'
  const gridColor = isDark ? '#334155' : '#e2e8f0'
  const bgColor = isDark ? '#1e293b' : '#f8fafc'

  const defaultLayout = {
    paper_bgcolor: bgColor,
    plot_bgcolor: bgColor,
    font: { family: 'Inter, sans-serif', size: 13, color: fontColor },
    margin: { t: 48, r: 24, b: 64, l: 64 },
    legend: { font: { color: fontColor } },
    dragmode: false,
    ...chartLayout,
    xaxis: {
      gridcolor: gridColor,
      linecolor: gridColor,
      zerolinecolor: gridColor,
      ...(chartLayout?.xaxis || {}),
    },
    yaxis: {
      gridcolor: gridColor,
      linecolor: gridColor,
      zerolinecolor: gridColor,
      ...(chartLayout?.yaxis || {}),
    },
  }

  const defaultConfig = {
    displayModeBar: false,
    responsive: true,
    scrollZoom: false,
    ...config,
  }

  return (
    <div style={{ borderRadius: '0.5rem', overflow: 'hidden', margin: '1.5rem 0' }}>
      <Plot
        data={chartData}
        layout={defaultLayout}
        config={defaultConfig}
        frames={frames}
        style={{ width: '100%', ...style }}
        useResizeHandler
      />
    </div>
  )
}
