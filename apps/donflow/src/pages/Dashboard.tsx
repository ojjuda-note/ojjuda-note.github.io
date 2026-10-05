import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useMonthlyStats,
  useBudgetComparison,
  useMonthlyTrend,
} from '@/hooks/useDB'
import { formatCurrency, formatNumber, getMonthKey } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { useLanguage, getCurrency } from '@/lib/i18n'

export default function Dashboard() {
  const { t } = useLanguage()
  const [monthOffset, setMonthOffset] = useState(0)
  const now = new Date()
  const targetDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const monthKey = getMonthKey(targetDate)
  const monthLabel = t('yearSuffix')
    ? `${targetDate.getFullYear()}${t('yearSuffix')} ${targetDate.getMonth() + 1}${t('monthSuffix')}`
    : `${targetDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`

  const { income, expense } = useMonthlyStats(monthKey)
  const budgetComparison = useBudgetComparison(monthKey)
  const navigate = useNavigate()


  const totalBudget = budgetComparison.reduce((s, b) => s + b.planned, 0)
  const hasBudgets = budgetComparison.length > 0
  const remainingBudget = totalBudget - expense

  // Projection
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate()
  const daysRemaining = daysInMonth - dayOfMonth
  const projectedExpense = dayOfMonth > 0 && monthOffset === 0
    ? Math.round(expense / dayOfMonth * daysInMonth)
    : expense
  const projectionDiff = totalBudget - projectedExpense

  const trend = useMonthlyTrend(6)
  const sortedBudgets = [...budgetComparison].sort((a, b) => b.planned - a.planned)

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">통계</h2>
      {/* Month Navigator */}
      <nav className="flex items-center justify-between" aria-label="Month navigation">
        <Button variant="ghost" size="icon" onClick={() => setMonthOffset(m => m - 1)} aria-label="이전 달">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">{monthLabel}</span>
        <Button variant="ghost" size="icon" onClick={() => setMonthOffset(m => m + 1)} disabled={monthOffset >= 0} aria-label="다음 달">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </nav>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2" role="region" aria-label="Financial summary">
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">{t('income')}</p>
          <p className="text-sm font-bold text-income mt-1">{formatCurrency(income)}</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">{t('expense')}</p>
          <p className="text-sm font-bold text-expense mt-1">{formatCurrency(expense)}</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <p className="text-xs text-muted-foreground">{t('balance')}</p>
          <p className={`text-sm font-bold mt-1 ${(income) - expense >= 0 ? 'text-income' : 'text-destructive'}`}>
            {formatCurrency((income) - expense)}
          </p>
        </div>
      </div>

      {/* Savings Rate */}
      {(income > 0) && expense > 0 && (
        (() => {
          const effectiveIncome = income
          const savingsRate = Math.round((effectiveIncome - expense) / effectiveIncome * 100)
          const isPositive = savingsRate > 0
          const ratingText = savingsRate >= 30 ? t('excellent') : savingsRate >= 15 ? t('good') : t('needsWork')
          const ratingColor = savingsRate >= 30 ? 'text-emerald-400' : savingsRate >= 15 ? 'text-amber-400' : 'text-destructive'
          const ratingEmoji = savingsRate >= 30 ? '🌟' : savingsRate >= 15 ? '👍' : '⚡'

          return (
            <div className="rounded-xl bg-secondary/30 p-4 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{t('savingsRate')}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-lg ${isPositive ? 'text-emerald-400' : 'text-destructive'}`}>
                    {savingsRate}%
                  </span>
                  <span className={`text-xs ${ratingColor}`}>{ratingEmoji} {ratingText}</span>
                </div>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    savingsRate >= 30 ? 'bg-emerald-500' : savingsRate >= 15 ? 'bg-amber-500' : 'bg-destructive'
                  }`}
                  style={{ width: `${Math.min(Math.max(savingsRate, 0), 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('savingsRateDesc')} — {getCurrency()}{formatNumber(Math.max(effectiveIncome - expense, 0))} {t('surplus')}
              </p>
            </div>
          )
        })()
      )}

      {/* 6-Month Spending Trend */}
      {trend.length > 0 && trend.some(m => m.expense > 0 || m.income > 0) && (() => {
        const maxVal = Math.max(...trend.map(m => Math.max(m.expense, m.income)), 1)
        const barWidth = 100 / trend.length
        const chartH = 120
        const labelH = 20
        const svgH = chartH + labelH
        return (
          <div className="rounded-xl bg-secondary/30 p-4 space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium text-muted-foreground">{t('monthlyTrend') || '📈 Monthly Trend'}</p>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> {t('income')}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-indigo-500" /> {t('expense')}</span>
              </div>
            </div>
            <svg viewBox={`0 0 ${trend.length * 60} ${svgH}`} className="w-full" role="img" aria-label="Monthly spending trend chart">
              {trend.map((m, i) => {
                const x = i * 60
                const incomeH = (m.income / maxVal) * chartH
                const expenseH = (m.expense / maxVal) * chartH
                const bw = 20
                return (
                  <g key={m.month}>
                    {/* Income bar */}
                    <rect x={x + 10} y={chartH - incomeH} width={bw} height={incomeH} rx={3} fill="#10b981" opacity={0.7} />
                    {/* Expense bar */}
                    <rect x={x + 32} y={chartH - expenseH} width={bw} height={expenseH} rx={3} fill="#6366f1" opacity={0.8} />
                    {/* Month label */}
                    <text x={x + 30} y={svgH - 4} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '10px' }}>{m.label}</text>
                    {/* Expense value on top */}
                    {m.expense > 0 && (
                      <text x={x + 42} y={chartH - expenseH - 4} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '8px' }}>
                        {m.expense >= 1000000 ? `${(m.expense / 1000000).toFixed(1)}M` : m.expense >= 1000 ? `${Math.round(m.expense / 1000)}K` : m.expense}
                      </text>
                    )}
                  </g>
                )
              })}
              {/* Zero line */}
              <line x1="0" y1={chartH} x2={trend.length * 60} y2={chartH} stroke="currentColor" strokeOpacity={0.1} />
            </svg>
          </div>
        )
      })()}

      {/* Pace Projection Banner */}
      {hasBudgets && monthOffset === 0 && daysRemaining > 0 && (
        <div className={`rounded-xl p-3 border ${
          projectionDiff >= 0
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : 'bg-destructive/10 border-destructive/20'
        }`}>
          <p className="text-sm">
            {t('currentPace')} <span className="font-bold">{daysRemaining} {t('daysRemaining')}</span>{' '}
            {projectionDiff >= 0 ? (
              <span className="text-emerald-400 font-bold">{getCurrency()}{formatNumber(projectionDiff)} {t('surplus')}</span>
            ) : (
              <span className="text-destructive font-bold">{getCurrency()}{formatNumber(Math.abs(projectionDiff))} {t('overBudget')}</span>
            )}
            {' '}{t('forecast')}
          </p>
        </div>
      )}

      {/* Daily Spending Rate */}
      {hasBudgets && monthOffset === 0 && dayOfMonth > 0 && expense > 0 && (
        (() => {
          const dailyAvg = Math.round(expense / dayOfMonth)
          const dailyBudget = Math.round(totalBudget / daysInMonth)
          const isOverDaily = dailyAvg > dailyBudget
          return (
            <div className="flex items-center justify-between rounded-xl bg-secondary/30 px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('dailyAvgSpending')}</span>
                <span className={`font-bold ${isOverDaily ? 'text-destructive' : 'text-emerald-400'}`}>
                  {getCurrency()}{formatNumber(dailyAvg)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('dailyBudget')}</span>
                <span className="font-medium">{getCurrency()}{formatNumber(dailyBudget)}</span>
              </div>
            </div>
          )
        })()
      )}

      {/* Budget Alert Banners */}
      {hasBudgets && budgetComparison.filter(b => b.percentage >= 100).length > 0 && (
        <div className="space-y-2">
          {budgetComparison.filter(b => b.percentage >= 100).map(item => (
            <div key={item.categoryId} className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm font-medium">🔴 {item.categoryIcon} {item.categoryName} {t('budgetExceeded')} {getCurrency()}{formatNumber(item.diff)} {t('over')}</p>
            </div>
          ))}
        </div>
      )}
      {hasBudgets && budgetComparison.filter(b => b.percentage >= 80 && b.percentage < 100).length > 0 && (
        <div className="space-y-2">
          {budgetComparison.filter(b => b.percentage >= 80 && b.percentage < 100).map(item => (
            <div key={item.categoryId} className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-sm font-medium">🟡 {item.categoryIcon} {item.categoryName} {item.percentage}% — {t('caution')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Category Progress Bars — The Core */}
      {hasBudgets ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">{t('categoryPlanVsActual')}</p>
          <div className="space-y-3">
            {sortedBudgets.map((item) => {
              const pct = item.percentage
              const isOver = pct >= 100
              const isWarning = pct >= 80 && pct < 100
              const statusIcon = isOver ? '🔴' : isWarning ? '⚠️' : pct >= 60 ? '' : '✅'
              const statusText = isOver ? t('exceeded') : isWarning ? t('caution') : pct < 30 ? t('comfortable') : ''

              return (
                <div key={item.categoryId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.categoryIcon} {item.categoryName}</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {formatNumber(item.actual)}/{formatNumber(item.planned)}
                      </span>
                      <span className={`font-bold ${
                        isOver ? 'text-destructive' : isWarning ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {pct}%
                      </span>
                      {statusIcon && <span>{statusIcon}</span>}
                    </div>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${item.categoryName} budget usage`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOver ? 'bg-destructive' : isWarning ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border p-4 text-sm space-y-3">
          <p>예산을 정하면 얼마나 남았는지 함께 볼 수 있어요.</p>
          <Button variant="outline" onClick={() => navigate('/structure')}>예산 설정하기</Button>
        </div>
      )}

      {/* Overall Progress */}
      {hasBudgets && (
        <div className="rounded-xl bg-secondary/30 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('overallBurnRate')}</span>
            <span className="font-bold">{totalBudget > 0 ? Math.round(expense / totalBudget * 100) : 0}%</span>
          </div>
          <div className="h-4 bg-secondary rounded-full overflow-hidden" role="progressbar" aria-valuenow={totalBudget > 0 ? Math.round(expense / totalBudget * 100) : 0} aria-valuemin={0} aria-valuemax={100} aria-label="Overall budget burn rate">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                expense > totalBudget ? 'bg-destructive' : expense > totalBudget * 0.8 ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.min(totalBudget > 0 ? (expense / totalBudget * 100) : 0, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{getCurrency()}{formatNumber(expense)} {t('used')}</span>
            <span>{getCurrency()}{formatNumber(totalBudget)} {t('planned')}</span>
          </div>
        </div>
      )}


    </div>
  )
}
