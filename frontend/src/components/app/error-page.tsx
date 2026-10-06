import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ServerCrash } from 'lucide-react'
import { AppFooter } from '@/components/app/app-footer'
import { EmptyState } from '@/components/shared/panel'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { pageShellClassName } from '@/lib/app-constants'

type ErrorPageProps = {
  header?: ReactNode
  title?: string
  description?: string
}

export function ErrorPage({
  header,
  title = '페이지를 불러오지 못했습니다',
  description = '서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.',
}: ErrorPageProps) {
  return (
    <div className={pageShellClassName}>
      {header}
      <Card className="min-h-96 flex-1">
        <EmptyState
          icon={ServerCrash}
          title={title}
          description={description}
          action={
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              새로고침
            </Button>
          }
        />
      </Card>
      <AppFooter />
    </div>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] render failed', error, info.componentStack)
  }

  render() {
    return this.state.failed ? (
      <ErrorPage title="문제가 발생했습니다" description="화면을 그리는 중 오류가 발생했습니다. 새로고침해 주세요." />
    ) : (
      this.props.children
    )
  }
}
