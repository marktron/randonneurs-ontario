/**
 * Renders a label paragraph with the portion before the first colon bolded,
 * e.g. "REGULATIONS: ..." → <strong>REGULATIONS:</strong> ... . Shared by the
 * printed control card and the digital brevet card so both render the
 * regulations copy identically.
 */
export function BoldLabelText({ text }: { text: string }) {
  const colonIndex = text.indexOf(':')
  if (colonIndex === -1) return <>{text}</>

  const label = text.substring(0, colonIndex + 1)
  const content = text.substring(colonIndex + 1)

  return (
    <>
      <strong>{label}</strong>
      {content}
    </>
  )
}
