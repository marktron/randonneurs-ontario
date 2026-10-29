import { AwardRecipientTable } from '@/components/award-recipient-table'
import type { AwardRecipient } from '@/types/records'

interface ClubHonourSectionProps {
  title: string
  /** Static label such as "Best Female Rider" shown above the title */
  subtitle?: string
  description: string
  recipients: AwardRecipient[]
}

/** Compact award block for the two-column club honours grid on /awards. */
export function ClubHonourSection({
  title,
  subtitle,
  description,
  recipients,
}: ClubHonourSectionProps) {
  return (
    <div className="min-w-0">
      {subtitle && (
        <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">{subtitle}</p>
      )}
      <h3 className="font-serif text-2xl tracking-tight">{title}</h3>
      <p className="mt-3 text-muted-foreground leading-relaxed">{description}</p>
      <div className="mt-6">
        <AwardRecipientTable recipients={recipients} />
      </div>
    </div>
  )
}
