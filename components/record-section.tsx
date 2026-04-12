interface RecordSectionProps {
  title: string
  description?: React.ReactNode
  image?: React.ReactNode
  children: React.ReactNode
}

export function RecordSection({ title, description, image, children }: RecordSectionProps) {
  return (
    <section className="py-12 md:py-16 border-b border-border last:border-b-0">
      <div className="content-container">
        {image ? (
          <div className="flex items-start gap-5 md:gap-6">
            <div className="shrink-0 w-20 h-20 md:w-24 md:h-24">{image}</div>
            <div className="min-w-0">
              <h2 className="font-serif text-3xl md:text-4xl tracking-tight">{title}</h2>
              {description && (
                <p className="mt-3 text-muted-foreground leading-relaxed">{description}</p>
              )}
            </div>
          </div>
        ) : (
          <>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight">{title}</h2>
            {description && (
              <p className="mt-3 text-muted-foreground leading-relaxed">{description}</p>
            )}
          </>
        )}
        <div className="mt-8 grid gap-10 lg:gap-12">{children}</div>
      </div>
    </section>
  )
}
