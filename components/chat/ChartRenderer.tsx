'use client'

import { useRef } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChartRendererProps {
  subtype: 'bar' | 'line' | 'pie'
  data: Record<string, unknown>[]
  chartConfig: {
    xKey: string
    yKey: string
    title: string
    color?: string
  }
}

const CHART_COLORS = [
  'hsl(192, 100%, 50%)',
  'hsl(38, 92%, 55%)',
  'hsl(160, 100%, 45%)',
  'hsl(258, 90%, 66%)',
  'hsl(350, 80%, 60%)',
  'hsl(45, 93%, 47%)',
  'hsl(280, 80%, 60%)',
  'hsl(200, 90%, 50%)',
]

const CHART_COLORS_HEX = [
  '#00d4ff',
  '#f0a030',
  '#17e685',
  '#9b6dff',
  '#e64a6e',
  '#f0c030',
  '#b366ff',
  '#33b3e6',
]

const RADIAL_COLORS = [
  '#00d4ff',
  '#f0a030',
  '#17e685',
  '#9b6dff',
  '#e64a6e',
  '#f0c030',
  '#b366ff',
  '#33b3e6',
]

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div
      className={cn(
        'rounded-lg border border-border shadow-xl',
        'bg-card p-3'
      )}
    >
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm font-medium text-foreground">
            {typeof entry.value === 'number'
              ? entry.value.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })
              : entry.value}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatLabel(entry.name)}
          </span>
        </div>
      ))}
    </div>
  )
}

interface PieTooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>
}

function PieCustomTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const entry = payload[0]
  return (
    <div
      className={cn(
        'rounded-lg border border-border shadow-xl',
        'bg-card p-3'
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: entry.payload.fill }}
        />
        <span className="text-sm font-medium text-foreground">
          {entry.name}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Value:{' '}
        <span className="text-foreground">
          {typeof entry.value === 'number'
            ? entry.value.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })
            : entry.value}
        </span>
      </p>
    </div>
  )
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function renderCustomLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  percent: number
}) {
  if (percent < 0.05) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export function ChartRenderer({ subtype, data, chartConfig }: ChartRendererProps) {
  const chartRef = useRef<HTMLDivElement>(null)

  const handleExportPNG = async () => {
    if (!chartRef.current) return
    const svg = chartRef.current.querySelector('svg')
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    const xml = new XMLSerializer().serializeToString(clone)
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `${chartConfig.title || 'chart'}.svg`
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }

  const preparedData = data.map((row) => {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(row)) {
      if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
        result[key] = Number(val)
      } else {
        result[key] = val
      }
    }
    return result
  })

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-foreground">
          {chartConfig.title}
        </h4>
        <button
          onClick={handleExportPNG}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs',
            'text-muted-foreground hover:text-foreground',
            'border border-border hover:border-primary',
            'transition-all'
          )}
        >
          <Download className="w-3 h-3" />
          Export SVG
        </button>
      </div>

      <div
        ref={chartRef}
        className="rounded-lg border border-border bg-card p-4"
      >
        {subtype === 'bar' && (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={preparedData}
              margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(220, 20%, 18%)"
              />
              <XAxis
                dataKey={chartConfig.xKey}
                tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(220, 20%, 18%)' }}
                tickLine={{ stroke: 'hsl(220, 20%, 18%)' }}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(220, 20%, 18%)' }}
                tickLine={{ stroke: 'hsl(220, 20%, 18%)' }}
                tickFormatter={(v: number) =>
                  v >= 1000000
                    ? `${(v / 1000000).toFixed(1)}M`
                    : v >= 1000
                      ? `${(v / 1000).toFixed(1)}K`
                      : String(v)
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">
                    {formatLabel(value)}
                  </span>
                )}
              />
              <Bar
                dataKey={chartConfig.yKey}
                fill={CHART_COLORS_HEX[0]}
                radius={[4, 4, 0, 0]}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        )}

        {subtype === 'line' && (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart
              data={preparedData}
              margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(220, 20%, 18%)"
              />
              <XAxis
                dataKey={chartConfig.xKey}
                tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(220, 20%, 18%)' }}
                tickLine={{ stroke: 'hsl(220, 20%, 18%)' }}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fill: 'hsl(215, 20%, 55%)', fontSize: 12 }}
                axisLine={{ stroke: 'hsl(220, 20%, 18%)' }}
                tickLine={{ stroke: 'hsl(220, 20%, 18%)' }}
                tickFormatter={(v: number) =>
                  v >= 1000000
                    ? `${(v / 1000000).toFixed(1)}M`
                    : v >= 1000
                      ? `${(v / 1000).toFixed(1)}K`
                      : String(v)
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">
                    {formatLabel(value)}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey={chartConfig.yKey}
                stroke={CHART_COLORS_HEX[0]}
                strokeWidth={2.5}
                dot={{ fill: CHART_COLORS_HEX[0], r: 4 }}
                activeDot={{
                  fill: CHART_COLORS_HEX[0],
                  r: 6,
                  stroke: '#fff',
                  strokeWidth: 2,
                }}
                animationDuration={800}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {subtype === 'pie' && (
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={preparedData}
                dataKey={chartConfig.yKey}
                nameKey={chartConfig.xKey}
                cx="50%"
                cy="50%"
                outerRadius={130}
                innerRadius={50}
                labelLine={false}
                label={renderCustomLabel}
                animationDuration={800}
                animationEasing="ease-out"
              >
                {preparedData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={RADIAL_COLORS[index % RADIAL_COLORS.length]}
                    stroke="hsl(220, 20%, 9%)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<PieCustomTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">
                    {formatLabel(value)}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
