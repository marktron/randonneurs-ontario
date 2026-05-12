'use client'

// Field name/id deliberately avoid 'url', 'website', 'homepage', 'email',
// 'name' and other tokens that password managers treat as fillable. The
// data-*-ignore attributes are the documented opt-outs for 1Password,
// LastPass, and Bitwarden — without them, managers will fill this hidden
// input on submit and silently drop a legitimate registration.
export function HoneypotField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-9999px',
        top: 'auto',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
      }}
    >
      <label htmlFor="ro_check">Leave this field blank</label>
      <input
        id="ro_check"
        name="ro_check"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
