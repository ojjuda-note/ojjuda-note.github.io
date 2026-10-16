import type { Snapshot } from './snapshot'

// Columns selected from life_ledger_entries; local legacy entries use the same shape.
export interface LegacyLedgerEntry {
  id: string
  date: string
  type: 'income' | 'expense'
  category?: string
  memo?: string
  amount: number | string
  deleted_at?: string | null
}
interface ClientError { code?: string; message?: string }
interface ClientResult<T> { data: T; error: ClientError | null }
interface SnapshotQuery {
  select(columns: 'payload,revision'): SnapshotQuery
  eq(column: 'user_id', owner: string): SnapshotQuery
  maybeSingle(): PromiseLike<ClientResult<{payload: unknown; revision: string} | null>>
}
interface LegacyQuery {
  select(columns: 'id,date,type,category,memo,amount,deleted_at'): LegacyQuery
  eq(column: 'user_id', owner: string): LegacyQuery
  order(column: 'id'): LegacyQuery
  range(from: number, to: number): PromiseLike<ClientResult<LegacyLedgerEntry[]>>
}
// Only the existing host-client operations used by this embedded app are exposed.
interface LedgerClient {
  from(table: 'life_donflow_snapshots'): SnapshotQuery
  from(table: 'life_ledger_entries'): LegacyQuery
  rpc(name: 'life_donflow_save', args: {p_expected: string | null; p_revision: string; p_payload: Snapshot}): PromiseLike<ClientResult<string | null>>
}

export interface Host {
  owner: string
  // The existing site's authenticated client; never copied into URLs or messages.
  client: LedgerClient
  active: () => boolean
  expand: () => void
}
declare global {
  interface Window {
    ojjudaLedger: Host
    OjjudaDonflowHost?: { connect: (source: Window) => Host | null }
  }
}
