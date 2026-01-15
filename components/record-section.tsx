interface RecordSectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function RecordSection({ title, description, children }: RecordSectionProps) {
  return (
    <section className="py-12 md:py-16 border-b border-border last:border-b-0">
      <div className="content-container">
        <h2 className="font-serif text-3xl md:text-4xl tracking-tight">{title}</h2>
        {description && (
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-2xl">{description}</p>
        )}
        <div className="mt-8 grid gap-10 lg:gap-12">{children}</div>
      </div>
    </section>
  )
}
