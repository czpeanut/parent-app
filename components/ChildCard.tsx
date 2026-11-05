import Link from 'next/link'
import clsx from 'clsx'
import type { ChildData } from '@/lib/types'
import { ATTENDANCE_LABEL, KIND_LABEL, hm, readinessLevel } from '@/lib/display'

const TONE = {
  good: { bar: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700' },
  mid: { bar: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-700' },
  low: { bar: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-50 text-red-700' },
}
const ATT_CHIP = { none: 'bg-stone-100 text-ink-soft', in: 'bg-emerald-100 text-emerald-800', out: 'bg-sky-100 text-sky-800' }

export function ChildCard({ child }: { child: ChildData }) {
  const att = child.attendance_today
  return (
    <section className="card space-y-4" aria-label={child.student.display_name}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{child.student.display_name}</h2>
          {child.relationship && <p className="text-xs text-ink-mute">您是{child.relationship}</p>}
        </div>
        <span className={clsx('rounded-full px-3 py-1 text-sm font-semibold', ATT_CHIP[att.status])}>{ATTENDANCE_LABEL[att.status]}</span>
      </div>

      {att.events.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm text-ink-soft">
          {att.events.map((e, i) => (
            <li key={i} className="rounded-lg bg-paper px-2 py-1">{e.event_type === 'check_in' ? '到班' : '下課'} {hm(e.event_time)}</li>
          ))}
        </ul>
      )}

      {child.readiness.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-ink-soft">段考準備進度</h3>
          {child.readiness.map((r, i) => {
            const lv = readinessLevel(r.readiness), tone = TONE[lv.tone]
            return (
              <div key={i} className="rounded-xl bg-paper p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{r.scope.title}</p>
                  {r.days_left != null && r.days_left >= 0 && <p className="shrink-0 text-xs text-ink-mute">{r.days_left === 0 ? '今天考試' : `還有 ${r.days_left} 天`}</p>}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuenow={r.readiness} aria-valuemin={0} aria-valuemax={100}>
                    <div className={clsx('h-full rounded-full', tone.bar)} style={{ width: `${Math.max(0, Math.min(100, r.readiness))}%` }} />
                  </div>
                  <span className={clsx('w-12 text-right text-sm font-bold', tone.text)}>{r.readiness}%</span>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  <span className={clsx('mr-2 rounded px-1.5 py-0.5 font-semibold', tone.chip)}>{lv.label}</span>
                  已熟練 {r.mastered}／{r.total} 個{r.scope.subject === '數學' ? '題型' : '單元'}
                </p>
                {r.weakest.length > 0 && (
                  <p className="mt-1 text-xs text-ink-mute">還要加強：{r.weakest.map(w => `${w.name}（${w.progress}%）`).join('、')}</p>
                )}
              </div>
            )
          })}
          <p className="text-[11px] leading-relaxed text-ink-mute">準備進度：範圍內每個題型或單元練到熟練就算完成，依段考出題份量加權；還沒練過的算 0%。</p>
        </div>
      )}

      {child.recent_assessments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink-soft">最近測驗</h3>
          <ul className="divide-y divide-paper-line text-sm">
            {child.recent_assessments.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">
                  <span className="mr-1 text-xs text-ink-mute">{KIND_LABEL[a.kind] ?? ''}</span>{a.title}
                  {a.exam_date && <span className="ml-1 text-xs text-ink-mute">{a.exam_date.slice(5).replace('-', '/')}</span>}
                </span>
                <span className="shrink-0 font-semibold">{Math.round(a.rate)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href={`/messages/${child.student.id}`} className="btn-ghost w-full">
        訊息
        {child.unread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{child.unread}</span>}
      </Link>
    </section>
  )
}
