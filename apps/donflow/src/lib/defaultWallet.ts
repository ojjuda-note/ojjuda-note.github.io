import { db, type Account } from '@/db'
import { t } from '@/lib/i18n'

const LEGACY_WALLET_NAME = '기본 지갑'

export async function ensureDefaultWallet(): Promise<number> {
  const walletName = t('defaultWalletName')
  // Check current locale name first, then legacy name
  const existing = await db.accounts.where('name').equals(walletName).first()
    ?? await db.accounts.where('name').equals(LEGACY_WALLET_NAME).first()
  if (existing?.id) return existing.id

  const id = await db.accounts.add({
    name: walletName,
    type: 'cash',
    bankName: '',
    balance: 0,
    color: '#6366f1',
    icon: '💵',
    displayOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Account)
  return id as number
}

export async function getDefaultWalletId(): Promise<number | undefined> {
  const walletName = t('defaultWalletName')
  const w = await db.accounts.where('name').equals(walletName).first()
    ?? await db.accounts.where('name').equals(LEGACY_WALLET_NAME).first()
  return w?.id
}
