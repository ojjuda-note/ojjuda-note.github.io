import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n'
import { useTheme } from '@/hooks/useTheme'
import { exportJSON, exportCSV, importJSON } from '@/utils/exportData'

export default function Settings() {
  const { t } = useLanguage()
  const { theme, toggle } = useTheme()
  return <div className="space-y-4">
    <h2 className="text-lg font-bold">설정</h2>
    <Link to="/structure" className="oj-setting-link"><span>월별 예산 설정<small>필요할 때만 정해 두세요</small></span><span>›</span></Link>
    <Link to="/data" className="oj-setting-link"><span>파일·문자에서 가져오기<small>엑셀, CSV, 결제 알림과 전체 거래 목록</small></span><span>›</span></Link>
    <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-medium">백업·복원</summary>
      {/* Export / Import Data */}
      <div className="rounded-xl bg-secondary/30 p-4 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">{t('exportData')}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={exportJSON}>
            {t('exportJsonBackup')}
          </Button>
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={exportCSV}>
            {t('exportCsv')}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => {
              if (!confirm(t('importConfirm'))) return
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.json'
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (!file) return
                const result = await importJSON(file)
                if (result.success) {
                  const total = Object.values(result.tables).reduce((a, b) => a + b, 0)
                  alert(`${t('importSuccess')} ${total} ${t('tablesRestored')}`)
                  window.location.reload()
                } else {
                  alert(`${t('importFailed')}: ${result.error}`)
                }
              }
              input.click()
            }}
          >
            {t('importJsonBackup')}
          </Button>
        </div>
      </div>

    </details>
    <button className="oj-setting-link w-full text-left" onClick={toggle}>화면 밝기 <span>{theme === 'light' ? '밝게' : theme === 'dark' ? '어둡게' : '기기 설정'} · 변경</span></button>
    <p className="text-xs text-muted-foreground leading-relaxed">DonFlow를 오쭈다에 맞게 수정한 가계부예요. <a className="underline" href="https://github.com/maxmini0214/donflow" target="_blank" rel="noopener noreferrer">원본 소스</a> · <a className="underline" href="/ledger/THIRD_PARTY_NOTICES.txt" target="_blank" rel="noopener noreferrer">라이선스</a></p>
  </div>
}
