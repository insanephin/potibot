import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppFooter } from '@/components/app/app-footer'
import { PanelHeader } from '@/components/shared/panel'
import { Card } from '@/components/ui/card'
import { appName, contactEmail, pageShellClassName } from '@/lib/app-constants'
import { privacySections, termsSections, type LegalSection } from './content'

export type LegalDocument = 'terms' | 'privacy'

const effectiveDate = '2026년 10월 1일'

const documents: Record<LegalDocument, { title: string; intro: ReactNode; sections: LegalSection[] }> = {
  terms: {
    title: '이용약관',
    intro: `이 약관은 ${appName}(이하 "서비스")를 이용하는 데 필요한 운영자와 이용자의 권리·의무 및 책임 사항을 정합니다.`,
    sections: termsSections,
  },
  privacy: {
    title: '개인정보처리방침',
    intro: `${appName}(이하 "서비스") 운영자는 「개인정보 보호법」 등 관련 법령을 준수하며, 이용자의 개인정보를 어떻게 수집·이용·보관·파기하는지 다음과 같이 안내합니다.`,
    sections: privacySections,
  },
}

export function LegalPage({ header, document }: { header: ReactNode; document: LegalDocument }) {
  const { title, intro, sections } = documents[document]
  const other =
    document === 'terms' ? { to: '/privacy', label: '개인정보처리방침' } : { to: '/terms', label: '이용약관' }

  return (
    <div className={pageShellClassName}>
      {header}
      <Card className="flex-1 md:min-h-0">
        <PanelHeader title={title}>
          <Link to={other.to} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            {other.label}
          </Link>
        </PanelHeader>
        <article className="flex flex-col gap-8 overflow-y-auto px-5 py-6 leading-7 break-keep md:px-8">
          <p className="text-muted-foreground">{intro}</p>
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold">{section.title}</h3>
              {section.body}
            </section>
          ))}
          <p className="border-t border-border pt-6 text-muted-foreground">
            시행일: {effectiveDate}
            <br />
            문의:{' '}
            <a href={`mailto:${contactEmail}`} className="underline underline-offset-2 hover:text-foreground">
              {contactEmail}
            </a>
          </p>
        </article>
      </Card>
      <AppFooter />
    </div>
  )
}
