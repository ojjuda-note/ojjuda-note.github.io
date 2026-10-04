import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useLanguage, getCurrency, getLang } from '@/lib/i18n'
import { Pencil, Check, X, Plus, Trash2, ChevronUp, ChevronDown, Settings2, MinusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { db, type Category } from '@/db'
import {
  useMonthlySalary,
  useCategories,
  useBudgets,
} from '@/hooks/useDB'
import { formatNumber, getMonthKey } from '@/lib/utils'

// Group colors — locale-aware keys
function getGroupColors(): Record<string, string> {
  if (getLang() === 'ko') {
    return {
      '고정비': '#6366f1',
      '생활비': '#f59e0b',
      '저축/투자': '#10b981',
      '자유지출': '#ec4899',
      '저축': '#10b981',
    }
  }
  return {
    'Fixed': '#6366f1',
    'Living': '#f59e0b',
    'Savings/Investment': '#10b981',
    'Savings': '#10b981',
    'Discretionary': '#ec4899',
  }
}

function getDefaultGroupOrder(): string[] {
  if (getLang() === 'ko') {
    return ['고정비', '생활비', '저축/투자', '자유지출']
  }
  return ['Fixed', 'Living', 'Savings/Investment', 'Discretionary']
}

function getDefaultGroupName(): string {
  return getLang() === 'ko' ? '자유지출' : 'Discretionary'
}

function getFallbackCategoryName(): string {
  return getLang() === 'ko' ? '기타' : 'Other'
}

const EMOJI_PRESETS = [
  '🍔', '🍚', '🚗', '🚌', '☕', '🛒', '💊', '📚', '🏠', '💰',
  '🎮', '✈️', '🐕', '💄', '🏥', '📱', '🎵', '🔄', '🛡️', '🏦',
  '💕', '🎁', '📌', '🏋️', '🍺', '👶', '🐱', '💻', '🎬', '🧹',
]

const COLOR_PRESETS = [
  '#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E',
  '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#64748B',
]

interface CategoryFormData {
  name: string
  icon: string
  color: string
  groupName: string
  isIncome: boolean
}

const emptyForm = (): CategoryFormData => ({ name: '', icon: '📌', color: '#6B7280', groupName: getDefaultGroupName(), isIncome: false })

// Quick amount buttons — locale-aware
function getQuickAmounts() {
  if (getLang() === 'ko') {
    return [
      { label: 'quickAdd10' as const, value: 100000 },
      { label: 'quickAdd50' as const, value: 500000 },
      { label: 'quickAdd100' as const, value: 1000000 },
    ]
  }
  return [
    { label: 'quickAdd10' as const, value: 100 },
    { label: 'quickAdd50' as const, value: 500 },
    { label: 'quickAdd100' as const, value: 1000 },
  ]
}

export default function Structure() {
  const { t } = useLanguage()
  const GROUP_COLORS = getGroupColors()
  const salary = useMonthlySalary()
  const categories = useCategories()
  const monthKey = getMonthKey(new Date())
  const budgets = useBudgets(monthKey)

  const [editingSalary, setEditingSalary] = useState(false)
  const [salaryInput, setSalaryInput] = useState('')
  const [editingBudget, setEditingBudget] = useState<number | null>(null)
  const [budgetInput, setBudgetInput] = useState('')

  // Category management state
  const [editMode, setEditMode] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryFormData>(emptyForm())
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [deleteTransactionCount, setDeleteTransactionCount] = useState(0)

  // Long press context menu
  const [contextMenu, setContextMenu] = useState<{ catId: number; x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Group management
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // Close context menu on outside tap
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  const budgetMap = useMemo(() => {
    const m = new Map<number, number>()
    budgets.forEach(b => m.set(b.categoryId, b.amount))
    return m
  }, [budgets])

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
  const remaining = salary - totalBudget
  const isOverBudget = remaining < 0

  // Get unique group names from categories, maintaining order
  const groupNames = useMemo(() => {
    const expCats = categories.filter(c => !c.isIncome)
    const groups = new Set<string>()
    getDefaultGroupOrder().forEach(g => {
      if (expCats.some(c => c.groupName === g)) groups.add(g)
    })
    expCats.forEach(c => { if (c.groupName) groups.add(c.groupName) })
    return Array.from(groups)
  }, [categories])

  const groupedView = useMemo(() => {
    const expenseCategories = categories.filter(c => !c.isIncome)
    return groupNames.map(groupName => {
      const cats = expenseCategories
        .filter(c => c.groupName === groupName)
        .sort((a, b) => a.displayOrder - b.displayOrder)
      const groupTotal = cats.reduce((s, c) => s + (budgetMap.get(c.id!) ?? 0), 0)
      const groupPct = salary > 0 ? Math.round((groupTotal / salary) * 100) : 0
      return { groupName, cats, groupTotal, groupPct }
    })
  }, [categories, groupNames, budgetMap, salary])

  const hasAnyCategories = categories.some(c => !c.isIncome)

  const saveSalary = async () => {
    const val = parseInt(salaryInput)
    if (!val || val <= 0) return
    const existing = await db.appSettings.where('key').equals('monthlySalary').first()
    if (existing) {
      await db.appSettings.update(existing.id!, { value: String(val) })
    } else {
      await db.appSettings.add({ key: 'monthlySalary', value: String(val) })
    }
    setEditingSalary(false)
  }

  const saveBudget = async (categoryId: number) => {
    const amount = parseInt(budgetInput) || 0
    const existing = await db.budgets
      .where('[categoryId+month]')
      .equals([categoryId, monthKey])
      .first()
    if (existing) {
      if (amount === 0) {
        await db.budgets.delete(existing.id!)
      } else {
        await db.budgets.update(existing.id!, { amount })
      }
    } else if (amount > 0) {
      await db.budgets.add({ categoryId, amount, month: monthKey })
    }
    setEditingBudget(null)
    setBudgetInput('')
  }

  const addQuickAmount = (add: number) => {
    const current = parseInt(budgetInput) || 0
    setBudgetInput(String(current + add))
  }

  // Category CRUD
  const openAddDialog = useCallback((groupName?: string) => {
    setEditingCategory(null)
    setForm({ ...emptyForm(), groupName: groupName ?? getDefaultGroupName() })
    setDialogOpen(true)
  }, [])

  const openEditDialog = useCallback((cat: Category) => {
    setEditingCategory(cat)
    setForm({
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      groupName: cat.groupName ?? getDefaultGroupName(),
      isIncome: cat.isIncome,
    })
    setDialogOpen(true)
  }, [])

  const saveCategory = async () => {
    if (!form.name.trim()) return

    if (editingCategory) {
      await db.categories.update(editingCategory.id!, {
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        groupName: form.groupName,
        isIncome: form.isIncome,
      })
    } else {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.displayOrder), 0)
      await db.categories.add({
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        isIncome: form.isIncome,
        isDefault: false,
        displayOrder: maxOrder + 1,
        groupName: form.groupName,
      })
    }
    setDialogOpen(false)
  }

  const confirmDelete = async (catId: number) => {
    const count = await db.transactions.where('categoryId').equals(catId).count()
    setDeleteTransactionCount(count)
    setDeleteConfirm(catId)
  }

  const deleteCategory = async (catId: number) => {
    const etcCat = categories.find(c => c.name === getFallbackCategoryName())
    if (etcCat) {
      await db.transactions.where('categoryId').equals(catId).modify({ categoryId: etcCat.id! })
    }
    await db.budgets.where('categoryId').equals(catId).delete()
    await db.categories.delete(catId)
    setDeleteConfirm(null)
    setContextMenu(null)
  }

  const moveCategory = async (cat: Category, direction: 'up' | 'down') => {
    const sameCats = categories
      .filter(c => c.groupName === cat.groupName && c.isIncome === cat.isIncome)
      .sort((a, b) => a.displayOrder - b.displayOrder)
    const idx = sameCats.findIndex(c => c.id === cat.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sameCats.length) return
    const other = sameCats[swapIdx]
    await db.categories.update(cat.id!, { displayOrder: other.displayOrder })
    await db.categories.update(other.id!, { displayOrder: cat.displayOrder })
  }

  const addGroup = async () => {
    if (!newGroupName.trim() || groupNames.includes(newGroupName.trim())) return
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.displayOrder), 0)
    await db.categories.add({
      name: t('newCategory'),
      icon: '📌',
      color: '#6B7280',
      isIncome: false,
      isDefault: false,
      displayOrder: maxOrder + 1,
      groupName: newGroupName.trim(),
    })
    setAddGroupOpen(false)
    setNewGroupName('')
  }

  const deleteGroup = async (groupName: string) => {
    const groupCats = categories.filter(c => c.groupName === groupName)
    const etcCat = categories.find(c => c.name === getFallbackCategoryName() && c.groupName !== groupName)
    for (const cat of groupCats) {
      if (etcCat) {
        await db.transactions.where('categoryId').equals(cat.id!).modify({ categoryId: etcCat.id! })
      }
      await db.budgets.where('categoryId').equals(cat.id!).delete()
      await db.categories.delete(cat.id!)
    }
  }

  // Long press handlers for mobile
  const handleTouchStart = (catId: number, e: React.TouchEvent) => {
    const touch = e.touches[0]
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ catId, x: touch.clientX, y: touch.clientY })
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const whatIfRemaining = useMemo(() => {
    if (editingBudget == null) return remaining
    const editVal = parseInt(budgetInput) || 0
    const currentVal = budgetMap.get(editingBudget) ?? 0
    return remaining + currentVal - editVal
  }, [editingBudget, budgetInput, remaining, budgetMap])

  return (
    <div className="space-y-6">
      {/* Monthly Income */}
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground mb-1">{t('monthlyIncome')}</p>
        {editingSalary ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 justify-center">
              <Input
                type="number"
                value={salaryInput}
                onChange={e => setSalaryInput(e.target.value)}
                className="w-48 text-center text-lg font-bold"
                placeholder="0"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && saveSalary()}
              />
              <Button size="icon" variant="ghost" onClick={saveSalary} aria-label="Save salary">
                <Check className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingSalary(false)} aria-label="Cancel editing">
                <X className="w-4 h-4" />
              </Button>
            </div>
            {/* Quick amount buttons for salary */}
            <div className="flex items-center justify-center gap-2">
              {getQuickAmounts().map(({ label, value }) => (
                <button
                  key={label}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 transition-colors"
                  onClick={() => setSalaryInput(String((parseInt(salaryInput) || 0) + value))}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            {/* Real-time format preview */}
            {salaryInput && parseInt(salaryInput) > 0 && (
              <p className="text-sm text-muted-foreground">{getCurrency()}{formatNumber(parseInt(salaryInput))}</p>
            )}
          </div>
        ) : (
          <button
            onClick={() => { setSalaryInput(String(salary || '')); setEditingSalary(true) }}
            className="text-3xl font-extrabold tracking-tight hover:text-primary transition-colors"
          >
            {salary > 0 ? `${getCurrency()}${formatNumber(salary)}` : t('setIncome')}
            <Pencil className="w-4 h-4 inline ml-2 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Budget over-allocation warning */}
      {salary > 0 && isOverBudget && (
        <div className="rounded-xl p-3 border-2 border-destructive bg-destructive/10 text-destructive text-sm font-medium text-center animate-pulse">
          {t('budgetOverWarning')}
        </div>
      )}

      {/* Overall allocation bar */}
      {salary > 0 && totalBudget > 0 && (
        <div className={`space-y-2 ${isOverBudget ? 'rounded-xl p-3 border-2 border-destructive/30' : ''}`}>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('allocationTotal')} {getCurrency()}{formatNumber(totalBudget)} ({Math.round(totalBudget / salary * 100)}%)</span>
            <span className={remaining < 0 ? 'text-destructive font-semibold' : ''}>
              {remaining >= 0 ? `${t('unallocated')} ${getCurrency()}${formatNumber(remaining)}` : `${getCurrency()}${formatNumber(Math.abs(remaining))} ${t('overAllocated')}`}
            </span>
          </div>
          <div className="h-4 bg-secondary rounded-full overflow-hidden flex">
            {groupedView.map(g => {
              const pct = salary > 0 ? (g.groupTotal / salary) * 100 : 0
              return pct > 0 ? (
                <div
                  key={g.groupName}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: GROUP_COLORS[g.groupName] ?? '#6b7280' }}
                  title={`${g.groupName}: ${getCurrency()}${formatNumber(g.groupTotal)}`}
                />
              ) : null
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {groupedView.filter(g => g.groupTotal > 0).map(g => (
              <span key={g.groupName} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GROUP_COLORS[g.groupName] ?? '#6b7280' }} />
                {g.groupName} {g.groupPct}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Edit mode toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t('categoryManagement')}</h2>
        <Button
          size="sm"
          variant={editMode ? 'default' : 'outline'}
          className="h-8 text-xs gap-1"
          onClick={() => setEditMode(!editMode)}
        >
          <Settings2 className="w-3.5 h-3.5" />
          {editMode ? t('done') : t('edit')}
        </Button>
      </div>

      {/* What-if indicator when editing budget */}
      {editingBudget != null && (
        <div className={`rounded-xl p-3 border text-sm ${
          whatIfRemaining >= 0
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-destructive/10 border-destructive/20 text-destructive'
        }`}>
          🔮 {t('whatIfUnallocated')} {getCurrency()}{formatNumber(whatIfRemaining)}
        </div>
      )}

      {/* Empty state when no categories */}
      {salary > 0 && !hasAnyCategories && (
        <div className="text-center py-12 space-y-3">
          <div className="text-4xl">📂</div>
          <p className="text-muted-foreground">{t('emptyCategoryGuide')}</p>
          <Button onClick={() => openAddDialog()} className="gap-2">
            <Plus className="w-4 h-4" /> {t('addCategory')}
          </Button>
        </div>
      )}

      {/* Category Groups */}
      {salary > 0 && groupedView.map(({ groupName, cats, groupTotal, groupPct }) => (
        <section key={groupName} className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              ── {groupName} ──
              {groupTotal > 0 && (
                <span className="ml-2 text-foreground">{getCurrency()}{formatNumber(groupTotal)} ({groupPct}%)</span>
              )}
            </p>
            {editMode && (
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => openAddDialog(groupName)}
                  title={t('addCategoryToGroup')}
                  aria-label={`Add category to ${groupName}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  aria-label={`Delete group ${groupName}`}
                  onClick={() => {
                    if (confirm(`"${groupName}" — ${t('confirmDeleteGroup')}`)) {
                      deleteGroup(groupName)
                    }
                  }}
                  title={t('deleteGroup')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            {cats.map((cat, idx) => {
              const budgetAmount = budgetMap.get(cat.id!) ?? 0
              const isEditing = editingBudget === cat.id
              const pct = salary > 0 && budgetAmount > 0 ? Math.round((budgetAmount / salary) * 100) : 0

              return (
                <div
                  key={cat.id}
                  className="rounded-lg bg-secondary/30 p-3 relative"
                  onTouchStart={!editMode ? (e) => handleTouchStart(cat.id!, e) : undefined}
                  onTouchEnd={!editMode ? handleTouchEnd : undefined}
                  onTouchCancel={!editMode ? handleTouchEnd : undefined}
                  onContextMenu={(e) => {
                    if (!editMode) {
                      e.preventDefault()
                      setContextMenu({ catId: cat.id!, x: e.clientX, y: e.clientY })
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editMode && (
                        <>
                          {/* iOS-style red minus button */}
                          <button
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white bg-destructive hover:bg-destructive/80 transition-colors shrink-0"
                            onClick={() => confirmDelete(cat.id!)}
                          >
                            <MinusCircle className="w-4 h-4" />
                          </button>
                          <div className="flex flex-col -my-1">
                            <button
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                              onClick={() => moveCategory(cat, 'up')}
                              disabled={idx === 0}
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
                              onClick={() => moveCategory(cat, 'down')}
                              disabled={idx === cats.length - 1}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center text-sm"
                        style={{ backgroundColor: cat.color + '22' }}
                      >
                        {cat.icon}
                      </span>
                      <span className="text-sm">{cat.name}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {editMode ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(cat)}
                          aria-label={`Edit ${cat.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      ) : isEditing ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={budgetInput}
                              onChange={e => setBudgetInput(e.target.value)}
                              className="w-28 h-8 text-right text-sm"
                              placeholder="0"
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveBudget(cat.id!)
                                if (e.key === 'Escape') { setEditingBudget(null); setBudgetInput('') }
                              }}
                            />
                            <Button size="sm" className="h-8 text-xs" onClick={() => saveBudget(cat.id!)}>
                              {t('save')}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setEditingBudget(null); setBudgetInput('') }}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingBudget(cat.id!); setBudgetInput(String(budgetAmount || '')) }}
                          className="text-sm font-medium hover:text-primary transition-colors"
                        >
                          {budgetAmount > 0 ? (
                            <>{getCurrency()}{formatNumber(budgetAmount)} <span className="text-xs text-muted-foreground">{pct}%</span></>
                          ) : (
                            <span className="text-muted-foreground">{t('setBudget')}</span>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick amount buttons + format preview when editing budget */}
                  {isEditing && !editMode && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1.5">
                        {getQuickAmounts().map(({ label, value }) => (
                          <button
                            key={label}
                            className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 transition-colors"
                            onClick={() => addQuickAmount(value)}
                          >
                            {t(label)}
                          </button>
                        ))}
                      </div>
                      {budgetInput && parseInt(budgetInput) > 0 && (
                        <p className="text-xs text-muted-foreground pl-1">{getCurrency()}{formatNumber(parseInt(budgetInput))}</p>
                      )}
                    </div>
                  )}

                  {budgetAmount > 0 && !isEditing && !editMode && (
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all duration-300"
                        style={{ width: `${Math.min(pct * 2, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Always-visible "+ 카테고리 추가" button at bottom of each group */}
          {!editMode && (
            <button
              className="w-full py-2 rounded-lg border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              onClick={() => openAddDialog(groupName)}
            >
              {t('addCategoryQuick')}
            </button>
          )}
        </section>
      ))}

      {/* Edit mode bottom actions */}
      {editMode && salary > 0 && (
        <div className="space-y-2">
          <Button
            className="w-full h-11 text-sm gap-2"
            variant="outline"
            onClick={() => openAddDialog()}
          >
            <Plus className="w-4 h-4" /> {t('addCategory')}
          </Button>
          <Button
            className="w-full h-11 text-sm gap-2"
            variant="outline"
            onClick={() => setAddGroupOpen(true)}
          >
            <Plus className="w-4 h-4" /> {t('addGroupCategory')}
          </Button>
        </div>
      )}

      {salary === 0 && (
        <div className="text-center py-12 space-y-3">
          <div className="text-4xl">💰</div>
          <p className="text-muted-foreground">{t('setIncomeFirst')}</p>
          <p className="text-xs text-muted-foreground">{t('tapToEdit')}</p>
        </div>
      )}

      {/* Long press context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border rounded-xl shadow-lg overflow-hidden min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y, transform: 'translate(-50%, -100%)' }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-3 text-sm text-left hover:bg-secondary flex items-center gap-2"
            onClick={() => {
              const cat = categories.find(c => c.id === contextMenu.catId)
              if (cat) openEditDialog(cat)
              setContextMenu(null)
            }}
          >
            <Pencil className="w-3.5 h-3.5" /> {t('longPressEdit')}
          </button>
          <button
            className="w-full px-4 py-3 text-sm text-left hover:bg-secondary text-destructive flex items-center gap-2"
            onClick={() => {
              confirmDelete(contextMenu.catId)
              setContextMenu(null)
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> {t('longPressDelete')}
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{t('longPressDelete')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {deleteTransactionCount > 0 && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-500">
                ⚠️ {t('deleteWithTransactions').replace('{count}', String(deleteTransactionCount))}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => deleteConfirm !== null && deleteCategory(deleteConfirm)}
              >
                {t('confirm')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteConfirm(null)}
              >
                {t('cancel')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Category Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{editingCategory ? t('editCategory') : t('addCategory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t('name')}</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('categoryName')}
                autoFocus
              />
            </div>

            {/* Group */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t('group')}</label>
              <select
                className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring appearance-none"
                value={form.groupName}
                onChange={e => setForm(f => ({ ...f, groupName: e.target.value }))}
              >
                {groupNames.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Emoji */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t('icon')}</label>
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_PRESETS.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                      form.icon === emoji
                        ? 'bg-primary/20 ring-2 ring-primary scale-110'
                        : 'bg-secondary/50 hover:bg-secondary'
                    }`}
                    onClick={() => setForm(f => ({ ...f, icon: emoji }))}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">{t('color')}</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full transition-all ${
                      form.color === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setForm(f => ({ ...f, color }))}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-lg bg-secondary/30 p-3 flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-md flex items-center justify-center text-lg"
                style={{ backgroundColor: form.color + '22' }}
              >
                {form.icon}
              </span>
              <span className="text-sm font-medium">{form.name || t('preview')}</span>
              <span className="text-xs text-muted-foreground ml-auto">{form.groupName}</span>
            </div>

            <Button className="w-full" onClick={saveCategory} disabled={!form.name.trim()}>
              {editingCategory ? t('save') : t('add')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Group Dialog */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{t('addGroupCategory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder={t('groupNamePlaceholder')}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && addGroup()}
            />
            <Button className="w-full" onClick={addGroup} disabled={!newGroupName.trim()}>
              {t('add')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
