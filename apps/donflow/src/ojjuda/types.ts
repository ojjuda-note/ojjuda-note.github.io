export interface Host {
  owner: string
  // The existing site's authenticated client; never copied into URLs or messages.
  client: any
  active: () => boolean
  expand: () => void
}
declare global {
  interface Window {
    ojjudaLedger: Host
    OjjudaDonflowHost?: { connect: (source: Window) => Host | null }
  }
}
