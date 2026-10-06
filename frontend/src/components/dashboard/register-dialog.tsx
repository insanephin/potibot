import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { registerDashboard } from '@/api/dashboard'
import { usePopup } from '@/hooks/use-popup'

export function DashboardRegisterDialog({ onRegistered }: { onRegistered: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const popup = usePopup()

  const handleRegister = async () => {
    setIsSubmitting(true)
    try {
      await registerDashboard()
      onRegistered()
    } catch {
      void popup.alert('가입에 실패했습니다', '잠시 후 다시 시도해 주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-sm p-6">
        <div className="flex flex-col items-center text-center">
          <h2 className="text-lg font-semibold tracking-tight">대시보드 가입</h2>
          <p className="mt-2 text-sm text-muted-foreground">이 기능을 사용하려면 가입이 필요합니다.</p>
          <Button type="button" onClick={() => void handleRegister()} disabled={isSubmitting} className="mt-6 w-full">
            {isSubmitting ? '가입 중...' : '가입하기'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
