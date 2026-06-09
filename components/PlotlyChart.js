import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

export default function PlotlyChart({ data, layout, config, style }) {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme) === 'dark'

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
    ...layout,
    xaxis: {
      gridcolor: gridColor,
      linecolor: gridColor,
      zerolinecolor: gridColor,
      ...(layout?.xaxis || {}),
    },
    yaxis: {
      gridcolor: gridColor,
      linecolor: gridColor,
      zerolinecolor: gridColor,
      ...(layout?.yaxis || {}),
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
        data={data}
        layout={defaultLayout}
        config={defaultConfig}
        style={{ width: '100%', ...style }}
        useResizeHandler
      />
    </div>
  )
}
