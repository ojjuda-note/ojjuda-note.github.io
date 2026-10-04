import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { getLang } from './i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatKRW(amount: number): string {
  return formatCurrency(amount)
}

export function formatCurrency(amount: number): string {
  const lang = getLang()
  if (lang === 'ko') {
    return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

export function formatNumber(amount: number): string {
  const lang = getLang()
  return new Intl.NumberFormat(lang === 'ko' ? 'ko-KR' : 'en-US').format(amount)
}

export function getMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getMonthRange(monthKey: string): { start: Date; end: Date } {
  const [year, month] = monthKey.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { start, end }
}
