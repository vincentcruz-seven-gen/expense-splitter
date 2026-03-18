import { useState, useEffect } from 'react'
import { BarChart2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import Navbar from '../components/Navbar'
import { api } from '../api/client'
import { formatMoney } from '../utils/currency'

const GROUP_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6']

function StatCard({ label, value, sub, trend }) {
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const trendColor = trend > 0 ? 'text-red-500' : trend < 0 ? 'text-emerald-500' : 'text-slate-400'
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{formatMoney(value, 'PHP')}</p>
      {sub != null && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${trendColor}`}>
          <TrendIcon size={12} />
          <span>{sub}</span>
        </div>
      )}
    </div>
  )
}

function BarChart({ data, view, color }) {
  const [hovered, setHovered] = useState(null)
  const values = data.map((d) => d[view])
  const max = Math.max(...values, 1)

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-slate-300 text-sm">
        No data yet
      </div>
    )
  }

  return (
    <div className="flex items-end gap-1 h-44 pt-2">
      {data.map((d, i) => {
        const pct = Math.max((d[view] / max) * 100, d[view] > 0 ? 3 : 0)
        const isHovered = hovered === i
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1.5 relative cursor-default min-w-0"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {isHovered && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap z-10 pointer-events-none">
                {formatMoney(d[view], 'PHP')}
              </div>
            )}
            <div
              className="w-full rounded-t-md transition-all duration-200"
              style={{
                height: `${pct}%`,
                backgroundColor: color,
                opacity: hovered === null || isHovered ? 1 : 0.5,
              }}
            />
            <span className="text-xs text-slate-400 truncate w-full text-center leading-tight">
              {d.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function LineChart({ data, view, color }) {
  const [hovered, setHovered] = useState(null)
  const values = data.map((d) => d[view])
  const max = Math.max(...values, 1)

  if (data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-slate-300 text-sm">No data yet</div>
  }

  const W = 320, H = 116, PL = 20, PR = 20, PT = 20, PB = 24
  const cW = W - PL - PR, cH = H - PT - PB
  const sx = (i) => PL + (data.length > 1 ? (i / (data.length - 1)) * cW : cW / 2)
  const sy = (v) => PT + cH - (v / max) * cH
  const bottom = PT + cH
  const gradId = `lg${color.replace('#', '')}`

  const areaPath = [
    `M ${sx(0)} ${bottom}`,
    ...data.map((d, i) => `L ${sx(i)} ${sy(d[view])}`),
    `L ${sx(data.length - 1)} ${bottom}`,
    'Z',
  ].join(' ')

  const linePoints = data.map((d, i) => `${sx(i)},${sy(d[view])}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '160px', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'default' }}>
          <circle cx={sx(i)} cy={sy(d[view])} r="12" fill="transparent" />
          <circle cx={sx(i)} cy={sy(d[view])} r={hovered === i ? 5 : 3} fill={hovered === i ? color : 'white'} stroke={color} strokeWidth="2" />
          {hovered === i && (
            <g>
              <rect x={sx(i) > W * 0.7 ? sx(i) - 72 : sx(i) - 4} y={sy(d[view]) - 28} width="72" height="20" rx="4" fill="#1e293b" />
              <text x={sx(i) > W * 0.7 ? sx(i) - 36 : sx(i) + 32} y={sy(d[view]) - 14} textAnchor="middle" fill="white" fontSize="10">
                {formatMoney(d[view], 'PHP')}
              </text>
            </g>
          )}
          <text
            x={sx(i)} y={H - 4}
            textAnchor="middle"
            fill={hovered === i ? '#374151' : '#94a3b8'}
            fontSize="8"
            fontWeight={hovered === i ? '600' : '400'}
          >
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  )
}

function ChartCard({ title, data, defaultView, colors }) {
  const [view, setView] = useState(defaultView)
  const [chartType, setChartType] = useState('line')
  const color = view === 'total' ? colors[0] : colors[1]
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs gap-0.5">
            {['line', 'bar'].map((t) => (
              <button key={t} onClick={() => setChartType(t)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${chartType === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                {t === 'line' ? 'Line' : 'Bar'}
              </button>
            ))}
          </div>
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs gap-0.5">
            <button onClick={() => setView('total')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${view === 'total' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
              Group total
            </button>
            <button onClick={() => setView('my_share')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${view === 'my_share' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
              My share
            </button>
          </div>
        </div>
      </div>
      {chartType === 'line'
        ? <LineChart data={data} view={view} color={color} />
        : <BarChart data={data} view={view} color={color} />}
    </div>
  )
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/analytics')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const stats = data?.stats ?? {}
  const weekly = data?.weekly ?? []
  const monthly = data?.monthly ?? []
  const groups = stats.groups ?? {}

  const groupEntries = Object.entries(groups)
  const groupMax = Math.max(...groupEntries.map(([, v]) => v), 1)

  const monthDelta =
    stats.prev_month_total > 0
      ? Math.round(((stats.this_month_total - stats.prev_month_total) / stats.prev_month_total) * 100)
      : null

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <BarChart2 size={20} className="text-indigo-600" />
          <h1 className="text-xl font-bold text-slate-800">Spending Analytics</h1>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="This week (total)" value={stats.this_week_total} />
          <StatCard label="My share (week)" value={stats.this_week_my_share} />
          <StatCard
            label="This month (total)"
            value={stats.this_month_total}
            sub={
              monthDelta !== null
                ? `${monthDelta > 0 ? '+' : ''}${monthDelta}% vs last month`
                : null
            }
            trend={monthDelta}
          />
          <StatCard label="My share (month)" value={stats.this_month_my_share} />
        </div>

        {/* Weekly chart */}
        <div className="mb-4">
          <ChartCard
            title="Weekly Spending (last 8 weeks)"
            data={weekly}
            defaultView="total"
            colors={['#6366f1', '#8b5cf6']}
          />
        </div>

        {/* Monthly chart */}
        <div className="mb-4">
          <ChartCard
            title="Monthly Spending (last 6 months)"
            data={monthly}
            defaultView="total"
            colors={['#3b82f6', '#0ea5e9']}
          />
        </div>

        {/* Group breakdown */}
        {groupEntries.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Spending by Group (6 months)</h3>
            <div className="space-y-3">
              {groupEntries.map(([name, total], i) => {
                const pct = Math.round((total / groupMax) * 100)
                return (
                  <div key={name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-700 font-medium">{name}</span>
                      <span className="text-sm text-slate-500">{formatMoney(total, 'PHP')}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {weekly.length === 0 && monthly.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-slate-500">No data yet</p>
            <p className="text-sm mt-1">Add some expenses to see your spending trends</p>
          </div>
        )}
      </main>
    </div>
  )
}
