'use client'

import { useEffect } from 'react'
import type {
  ControlPoint,
  CardRider,
  OrganizerInfo,
  CardEvent,
  CardLeg,
} from '@/types/control-card'
import { REGULATIONS_TEXT, EVENT_INFO_TEXT } from '@/types/control-card'
import { QRCodeSVG } from 'qrcode.react'
import { BoldLabelText } from '@/components/bold-label-text'
import {
  backCardLayout,
  MAX_CARD_CONTROLS,
  expandRiderLegCards,
  titleStatesDistance,
} from '@/lib/controlPoints'

interface ControlCardsPrintProps {
  event: CardEvent
  organizer: OrganizerInfo
  controls: ControlPoint[]
  riders: CardRider[]
  totalAllowableTime: { hours: number; minutes: number }
  formattedDate: string
  rwgpsUrl?: string
  /** Collection legs: one card per rider per leg (rider-major). Absent/empty = single-route. */
  legs?: CardLeg[]
}

export function ControlCardsPrint(props: ControlCardsPrintProps) {
  useAutoPrintIfRequested()
  return <ControlCardsPrintContent {...props} />
}

// When the page is loaded with ?autoprint=1 (from the iframe-style print
// workaround), trigger window.print() once fonts and layout have settled,
// then close the window after the print dialog dismisses. This is how the
// "Print Control Cards" button works in Safari, where direct window.print()
// on the main window has a WebKit bug that blanks the document.
function useAutoPrintIfRequested() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('autoprint') !== '1') return

    let cancelled = false

    const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    Promise.resolve(fontsReady)
      .then(() => {
        if (cancelled) return
        // Small delay to let final layout/paint settle.
        setTimeout(() => {
          if (cancelled) return
          window.addEventListener(
            'afterprint',
            () => {
              window.close()
            },
            { once: true }
          )
          window.print()
        }, 200)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])
}

function ControlCardsPrintContent({
  event,
  organizer,
  controls,
  riders,
  totalAllowableTime,
  formattedDate,
  rwgpsUrl,
  legs,
}: ControlCardsPrintProps) {
  const legList = legs ?? []
  const hasLegs = legList.length > 0

  // Backstop for deep links / stale URLs: never print a truncated card.
  // The forms block Generate above the cap, so normal flows never hit this.
  // For collection events the cap applies per leg, and the error names the leg.
  const oversizedLeg = legList.find((l) => l.controls.length > MAX_CARD_CONTROLS)
  if (oversizedLeg) {
    return (
      <div className="control-cards-print">
        <div className="card-overflow-error">
          <div style={{ fontWeight: 700, fontSize: '14pt', marginBottom: '0.15in' }}>
            Too many controls to print
          </div>
          <p>
            {oversizedLeg.legName} lists {oversizedLeg.controls.length} controls, but printed
            control cards support at most {MAX_CARD_CONTROLS} per leg. Merge or remove controls in
            the form, then generate again.
          </p>
        </div>
      </div>
    )
  }
  if (!hasLegs && controls.length > MAX_CARD_CONTROLS) {
    return (
      <div className="control-cards-print">
        <div className="card-overflow-error">
          <div style={{ fontWeight: 700, fontSize: '14pt', marginBottom: '0.15in' }}>
            Too many controls to print
          </div>
          <p>
            This card lists {controls.length} controls, but printed control cards support at most{' '}
            {MAX_CARD_CONTROLS}. Merge or remove controls in the form, then generate again.
          </p>
        </div>
      </div>
    )
  }

  // One card per rider (single-route), or per rider × leg in rider-major
  // order (collection). The existing 2-per-sheet pairing consumes the stream.
  type PrintCard = { rider: CardRider | null; leg: CardLeg | null }
  const cards: PrintCard[] = hasLegs
    ? expandRiderLegCards(riders, legList)
    : riders.map((rider) => ({ rider, leg: null }))

  const cardPairs: (PrintCard | null)[][] = []
  for (let i = 0; i < cards.length; i += 2) {
    cardPairs.push([cards[i], cards[i + 1] ?? null])
  }

  // If no cards, show at least one blank sheet
  if (cardPairs.length === 0) {
    cardPairs.push([null, null])
  }

  // Leg cards override the route identity: leg name as the route name, leg
  // distance, and a Route Map QR pointing at the leg's RWGPS route. Event
  // name/date/start info, organizer, and Submit Results QR are unchanged.
  const eventFor = (leg: CardLeg | null): CardEvent =>
    leg ? { ...event, routeName: leg.legName, distance: leg.distanceKm } : event
  const rwgpsUrlFor = (leg: CardLeg | null): string | undefined => (leg ? leg.rwgpsUrl : rwgpsUrl)
  const controlsFor = (leg: CardLeg | null): ControlPoint[] => (leg ? leg.controls : controls)

  return (
    <div className="control-cards-print">
      {/* Print button - hidden when printing */}
      <div
        className="no-print"
        style={{ padding: '1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}
      >
        <button
          type="button"
          onClick={() => {
            // Safari has a WebKit print bug on this page where direct
            // window.print() blanks the document and prints empty pages.
            // Workaround: open the same URL in a fresh window with
            // ?autoprint=1, which triggers print() in a clean document
            // context. Falls back to direct print if popup is blocked.
            const url = new URL(window.location.href)
            url.searchParams.set('autoprint', '1')
            const w = window.open(url.toString(), '_blank', 'width=900,height=1200')
            if (!w) window.print()
          }}
          style={{
            padding: '0.5rem 1rem',
            background: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Print Control Cards
        </button>
        <span style={{ marginLeft: '1rem', color: '#666' }}>
          {riders.length} rider{riders.length !== 1 ? 's' : ''}
          {hasLegs
            ? ` × ${legList.length} leg${legList.length !== 1 ? 's' : ''} = ${cards.length} cards`
            : ''}{' '}
          &middot; {cardPairs.length} page{cardPairs.length !== 1 ? 's' : ''} (double-sided)
        </span>
      </div>

      {cardPairs.map((pair, pairIndex) => (
        <div key={pairIndex}>
          {/* FRONT PAGE - Regulations and rider info */}
          <div className="card-page">
            {pair.map((card, cardIndex) => (
              <CardFront
                key={
                  card?.rider
                    ? `${card.rider.id}-${card.leg?.legRwgpsId ?? 'route'}`
                    : `empty-${pairIndex}-${cardIndex}`
                }
                event={eventFor(card?.leg ?? null)}
                organizer={organizer}
                rider={card?.rider ?? null}
                totalAllowableTime={totalAllowableTime}
                formattedDate={formattedDate}
                rwgpsUrl={rwgpsUrlFor(card?.leg ?? null)}
              />
            ))}
          </div>

          {/* BACK PAGE - Controls */}
          <div className="card-page page-break">
            {pair.map((card, cardIndex) => (
              <CardBack
                key={
                  card?.rider
                    ? `${card.rider.id}-${card.leg?.legRwgpsId ?? 'route'}-back`
                    : `empty-back-${pairIndex}-${cardIndex}`
                }
                event={eventFor(card?.leg ?? null)}
                controls={controlsFor(card?.leg ?? null)}
                formattedDate={formattedDate}
                rider={card?.rider ?? null}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CardFront({
  event,
  organizer,
  rider,
  totalAllowableTime,
  formattedDate,
  rwgpsUrl,
}: {
  event: CardEvent
  organizer: OrganizerInfo
  rider: CardRider | null
  totalAllowableTime: { hours: number; minutes: number }
  formattedDate: string
  rwgpsUrl?: string
}) {
  const verticalName =
    rider?.lastName || rider?.firstName
      ? `${rider.lastName}, ${rider.firstName}`.trim().replace(/^,\s*|,\s*$/g, '')
      : ''
  const verticalNameDisplay =
    verticalName && rider?.isFirstTimeRider ? `★ ${verticalName}` : verticalName

  return (
    <div className="card-half">
      {verticalName && <div className="rider-name-vertical">{verticalNameDisplay}</div>}
      {/* Left column - Regulations */}
      <div className="card-column front-left">
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.regulations} />
        </p>
        <p className="bold-warning">{REGULATIONS_TEXT.sagWagon}</p>
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.controlCard} />
        </p>
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.conduct} />
        </p>
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.cycle} />
        </p>
        <p>
          <BoldLabelText text={REGULATIONS_TEXT.assistance} />
        </p>
        <div style={{ marginTop: 'auto', paddingTop: '0.2in' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.05in' }}>
            MACHINE EXAMINER&apos;S STAMP &amp; SIGNATURE
          </div>
          <div style={{ border: '1px solid #000', height: '0.6in' }}></div>
        </div>
      </div>

      {/* Middle column - Time fields */}
      <div className="card-column front-middle">
        <div className="field-row" style={{ alignItems: 'baseline' }}>
          <div className="field-label">Start:</div>
          <div style={{ fontWeight: 600, fontSize: '9pt' }}>
            {event.startTime.slice(0, 5)} &middot; {formattedDate}
          </div>
        </div>

        <div className="field-row" style={{ marginTop: '0.08in' }}>
          <div style={{ flex: 1 }}>
            <div className="field-label">Finish Time:</div>
            <div className="field-box"></div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="field-label">Date:</div>
            <div className="field-box"></div>
          </div>
        </div>

        <div style={{ marginTop: '0.12in' }}>
          <div className="field-label" style={{ marginBottom: '0.04in' }}>
            Total Allowable Time
          </div>
          <div style={{ display: 'flex', gap: '0.1in', alignItems: 'baseline' }}>
            <span>HRS.</span>
            <span style={{ fontWeight: 700, fontSize: '10pt' }}>{totalAllowableTime.hours}</span>
            <span>MIN.</span>
            <span style={{ fontWeight: 700, fontSize: '10pt' }}>
              {String(totalAllowableTime.minutes).padStart(2, '0')}
            </span>
          </div>
        </div>

        <div style={{ marginTop: '0.12in' }}>
          <div className="field-label">Time Rider Completed Distance</div>
          <div className="field-row" style={{ alignItems: 'baseline', marginTop: '0.02in' }}>
            <span>HRS.</span>
            <div className="field-box"></div>
            <span>MIN.</span>
            <div className="field-box"></div>
          </div>
        </div>

        <div className="checkbox-row" style={{ marginTop: '0.1in' }}>
          <div className="field-label">Qualified</div>
          <span>Yes</span>
          <div className="checkbox"></div>
          <span>No</span>
          <div className="checkbox"></div>
        </div>

        <div style={{ marginTop: '0.15in' }}>
          <div className="field-label">Signature of Official</div>
          <div style={{ borderBottom: '1px solid #000', height: '0.4in' }}></div>
        </div>

        {rider?.cardUrl && (
          <div className="digital-card-banner" style={{ marginTop: 'auto' }}>
            <div className="digital-card-banner-text">
              New! Try out the
              <br />
              digital brevet card
            </div>
            <QRCodeSVG value={rider.cardUrl} size={52} />
          </div>
        )}

        {(rwgpsUrl || rider?.submissionUrl) && (
          <div
            style={{
              marginTop: rider?.cardUrl ? undefined : 'auto',
              display: 'flex',
              gap: '0.15in',
              justifyContent: 'space-between',
            }}
          >
            {rwgpsUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="field-label" style={{ marginBottom: '0.06in' }}>
                  Route Map
                </div>
                <QRCodeSVG value={rwgpsUrl} size={rider?.submissionUrl ? 72 : 86} />
              </div>
            )}
            {rider?.submissionUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className="field-label" style={{ marginBottom: '0.06in' }}>
                  Submit Your Results
                </div>
                <QRCodeSVG value={rider.submissionUrl} size={rwgpsUrl ? 72 : 86} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right column - Event and rider info */}
      <div className="card-column front-right">
        <div className="logo-section">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-gray.svg" alt="Randonneurs Ontario" width={100} height={100} />
        </div>

        <div className="card-title">Control Card</div>
        <div className="route-name">{event.routeName}</div>
        <div className="distance-date">
          {titleStatesDistance(event.routeName, event.distance) ? (
            formattedDate
          ) : (
            <>
              {event.distance} km &middot; {formattedDate}
            </>
          )}
        </div>

        <div className="rider-info">
          <div className="rider-label">Rider</div>
          <div className="rider-name">{rider ? `${rider.firstName} ${rider.lastName}` : ''}</div>
        </div>

        <div className="event-info">
          <div className="organizer-section">
            <div className="organizer-label">Ride Organizer</div>
            <div style={{ fontWeight: 600 }}>{organizer.name}</div>
            <div>{organizer.phone}</div>
            <div>{organizer.email}</div>
          </div>
          <div className="preamble-text">{EVENT_INFO_TEXT.preamble}</div>
          <div style={{ fontWeight: 700 }}>{EVENT_INFO_TEXT.emergency}</div>
        </div>
      </div>
    </div>
  )
}

function CardBack({
  event,
  controls,
  formattedDate,
  rider,
}: {
  event: CardEvent
  controls: ControlPoint[]
  formattedDate: string
  rider: CardRider | null
}) {
  const riderName =
    rider?.firstName || rider?.lastName ? `${rider.firstName} ${rider.lastName}`.trim() : ''
  // Fill each column completely before moving to the next. Rows per column
  // and typography tier scale with the control count (up to 3 × 8 = 24).
  const { rowsPerColumn, tier } = backCardLayout(controls.length)
  const column1 = controls.slice(0, rowsPerColumn)
  const column2 = controls.slice(rowsPerColumn, rowsPerColumn * 2)
  const column3 = controls.slice(rowsPerColumn * 2, rowsPerColumn * 3)

  return (
    <div className={`card-half back-${tier}`}>
      {[column1, column2, column3].map((columnControls, colIndex) => (
        <div key={colIndex} className="card-column back-column">
          {/* Header only on first column or if it's the start of controls */}
          {colIndex === 0 && (
            <div className="back-header">
              <div
                className="back-header-left"
                style={{ display: 'flex', alignItems: 'center', gap: '0.1in' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-gray.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="back-logo"
                  style={{ objectFit: 'contain' }}
                />
                <div style={{ fontWeight: 700 }}>Randonneurs Ontario</div>
              </div>
            </div>
          )}
          {colIndex === 1 && (
            <div
              className="back-header"
              style={{ display: 'flex', justifyContent: 'space-between' }}
            >
              <div style={{ fontWeight: 700 }}>
                {titleStatesDistance(event.routeName, event.distance)
                  ? event.routeName
                  : `${event.routeName} ${event.distance} km`}
              </div>
              <div>{formattedDate}</div>
            </div>
          )}
          {colIndex === 2 && (
            <div className="back-header">
              <div className="back-header-left" style={{ fontWeight: 700 }}>
                {riderName || '\u00A0'}
              </div>
            </div>
          )}

          {/* Ultra merges Time + Signature into one third-width Validation
              column so long control names keep a usable name cell. */}
          <div className="control-header">
            <div>Control</div>
            {tier === 'ultra' ? (
              <div>Validation</div>
            ) : (
              <>
                <div>Time</div>
                <div>Signature</div>
              </>
            )}
          </div>

          {columnControls.map((control) => (
            <div key={control.id} className="control-row">
              <div className="control-info">
                <div className="control-name">{control.name}</div>
                <div className="control-distance">{control.distance} km</div>
                {control.openTime && control.closeTime && (
                  <div className="control-times">
                    {tier === 'ultra' ? (
                      <>
                        {control.openTime} - {control.closeTime}
                      </>
                    ) : (
                      <>
                        Open: {control.openTime}
                        <br />
                        Close: {control.closeTime}
                      </>
                    )}
                  </div>
                )}
              </div>
              {tier === 'ultra' ? (
                <div className="signature-cell"></div>
              ) : (
                <>
                  <div className="time-cell"></div>
                  <div className="signature-cell"></div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
