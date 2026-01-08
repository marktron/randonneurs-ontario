'use client'

import type { ControlPoint, CardRider, OrganizerInfo, CardEvent } from '@/types/control-card'
import { REGULATIONS_TEXT, EVENT_INFO_TEXT } from '@/types/control-card'
import Image from 'next/image'

// Helper to render text with bold label (text before first colon)
function BoldLabelText({ text }: { text: string }) {
  const colonIndex = text.indexOf(':')
  if (colonIndex === -1) return <>{text}</>

  const label = text.substring(0, colonIndex + 1)
  const content = text.substring(colonIndex + 1)

  return (
    <>
      <strong>{label}</strong>{content}
    </>
  )
}

interface ControlCardsPrintProps {
  event: CardEvent
  organizer: OrganizerInfo
  controls: ControlPoint[]
  riders: CardRider[]
  totalAllowableTime: { hours: number; minutes: number }
  formattedDate: string
}

export function ControlCardsPrint({
  event,
  organizer,
  controls,
  riders,
  totalAllowableTime,
  formattedDate,
}: ControlCardsPrintProps) {
  // Pair riders (2 per page), adding empty rider if odd number
  const riderPairs: (CardRider | null)[][] = []
  for (let i = 0; i < riders.length; i += 2) {
    riderPairs.push([
      riders[i],
      riders[i + 1] || null,
    ])
  }

  // If no riders, show at least one blank card
  if (riderPairs.length === 0) {
    riderPairs.push([null, null])
  }

  return (
    <div className="control-cards-print">
      {/* Load Noto Sans and Noto Serif with variable width axis */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Sans:wdth,wght@62.5..100,100..900&family=Noto+Serif:wdth,wght@62.5..100,100..900&display=swap"
      />
      <style jsx global>{`
        @page {
          size: letter;
          margin: 0;
        }

        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-after: always;
          }
          /* Hide admin sidebar and wrapper when printing */
          [data-sidebar],
          aside,
          nav,
          [data-slot="sidebar"] {
            display: none !important;
            width: 0 !important;
          }
          /* Reset all layout containers */
          main,
          [data-slot="sidebar-inset"],
          [data-sidebar-inset],
          .flex,
          body > div {
            margin: 0 !important;
            padding: 0 !important;
            margin-left: 0 !important;
            padding-left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            transform: none !important;
          }
          /* Reset fixed positioning for print */
          .control-cards-print {
            position: static !important;
            overflow: visible !important;
            inset: auto !important;
            z-index: auto !important;
          }
        }

        /* On screen: make print page full width overlay */
        .control-cards-print {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 50;
          background: #f5f5f5;
          overflow: auto;
          font-family: 'Noto Sans', sans-serif;
          font-stretch: 62.5%;
          font-size: 7.5pt;
          line-height: 1.3;
          color: #000;
        }

        .card-page {
          width: 8.5in;
          height: 11in;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          background: white;
        }

        .card-half {
          width: 8.5in;
          height: 5.5in;
          box-sizing: border-box;
          border-bottom: 1px solid #D9D9D9;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
        }

        .card-half:last-child {
          border-bottom: none;
        }

        .card-column {
          padding: 0.2in;
          border-right: 1px solid #D9D9D9;
          box-sizing: border-box;
          overflow: hidden;
        }

        .card-column:last-child {
          border-right: none;
        }

        /* Front card styles */
        .front-left {
          font-size: 7.5pt;
          line-height: 1.25;
          color: #404040;
        }

        .front-left p {
          margin: 0 0 0.8em 0;
        }

        .front-left strong {
          color: #000;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .front-left .bold-warning {
          font-weight: 700;
          color: #000;
        }

        .front-middle {
          display: flex;
          flex-direction: column;
          gap: 0.12in;
        }

        .field-row {
          display: flex;
          gap: 0.1in;
        }

        .field-label {
          font-size: 7.5pt;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #525252;
          white-space: nowrap;
        }

        .field-box {
          border-bottom: 1px solid #000;
          flex: 1;
          min-height: 0.22in;
        }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 0.1in;
        }

        .checkbox {
          width: 0.14in;
          height: 0.14in;
          border: 1px solid #000;
        }

        .front-right {
          display: flex;
          flex-direction: column;
        }

        .logo-section {
          display: flex;
          justify-content: center;
          margin-bottom: 0.15in;
        }


        .card-title {
          font-size: 8pt;
          font-weight: 500;
          text-transform: uppercase;
          color: #525252;
          margin-top: 0.1in;
        }

        .route-name {
          font-family: 'Noto Serif', serif;
          font-stretch: 75%;
          font-size: 21pt;
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.1;
          margin: 0.02in 0 0.04in 0;
          color: #000;
        }

        .distance-date {
          font-size: 10pt;
          font-weight: 500;
          color: #000;
          font-variant-numeric: tabular-nums;
        }

        .rider-info {
          margin-top: 0.2in;
          font-size: 7pt;
        }

        .rider-label, .organizer-label {
          font-size: 7.5pt;
          text-transform: uppercase;
          color: #525252;
          margin-bottom: 0.02in;
        }

        .rider-name {
          font-family: 'Noto Serif', serif;
          font-stretch: 75%;
          font-size: 11pt;
          font-weight: 500;
          margin-top: 0.02in;
        }

        .event-info {
          margin-top: auto;
          font-size: 9pt;
          line-height: 1.4;
          color: #404040;
        }

        .preamble-text {
          margin: 0.12in 0;
        }

        .organizer-section {
          margin-top: 0.12in;
          padding-top: 0.12in;
          border-top: 1px solid #D9D9D9;
        }

        /* Back card styles */
        .back-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 10pt;
          margin-bottom: 0;
          padding-bottom: 0.08in;
          border-bottom: 1.5px solid #000;
        }

        .back-header-left {
          font-weight: 500;
        }

        .control-header {
          display: grid;
          grid-template-columns: 1fr 0.65in 0.85fr;
          align-items: stretch;
          font-size: 8pt;
          text-transform: uppercase;
          color: #525252;
          border-bottom: 1px solid #000;
          margin-bottom: 0;
          text-align: center;
        }

        .control-header > div {
          padding: 0.075in 0;
          align-self: stretch;
        }

        .control-header > div:nth-child(2),
        .control-header > div:nth-child(3) {
          border-left: 1px solid #D9D9D9;
        }

        .control-row {
          display: grid;
          grid-template-columns: 1fr 0.65in 0.85fr;
          min-height: 1in;
          border-bottom: 1px solid #D9D9D9;
        }

        .control-info {
          font-size: 8pt;
          padding: 0.04in 0;
        }

        .control-name {
          font-weight: 600;
          font-size: 11pt;
          text-transform: uppercase;
          line-height: 1.1;
        }

        .control-distance {
          font-size: 9pt;
          font-variant-numeric: tabular-nums;
          color: #000;
          margin-top: 0.02in;
        }

        .control-times {
          font-size: 9pt;
          color: #525252;
          font-variant-numeric: tabular-nums;
          margin-top: 0.02in;
        }

        .time-cell {
          border-left: 1px solid #D9D9D9;
          padding: 0.04in 0 0.04in 0.06in;
        }

        .signature-cell {
          border-left: 1px solid #D9D9D9;
          padding: 0.04in 0 0.04in 0.06in;
        }

        .back-column {
          display: flex;
          flex-direction: column;
        }
      `}</style>

      {/* Print button - hidden when printing */}
      <div className="no-print" style={{ padding: '1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
        <button
          onClick={() => window.print()}
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
          {riders.length} rider{riders.length !== 1 ? 's' : ''} &middot; {riderPairs.length} page{riderPairs.length !== 1 ? 's' : ''} (double-sided)
        </span>
      </div>

      {riderPairs.map((pair, pairIndex) => (
        <div key={pairIndex}>
          {/* FRONT PAGE - Regulations and rider info */}
          <div className="card-page">
            {pair.map((rider, riderIndex) => (
              <CardFront
                key={rider?.id || `empty-${riderIndex}`}
                event={event}
                organizer={organizer}
                rider={rider}
                totalAllowableTime={totalAllowableTime}
                formattedDate={formattedDate}
              />
            ))}
          </div>

          {/* BACK PAGE - Controls */}
          <div className="card-page page-break">
            {pair.map((rider, riderIndex) => (
              <CardBack
                key={rider?.id || `empty-back-${riderIndex}`}
                event={event}
                controls={controls}
                formattedDate={formattedDate}
                rider={rider}
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
}: {
  event: CardEvent
  organizer: OrganizerInfo
  rider: CardRider | null
  totalAllowableTime: { hours: number; minutes: number }
  formattedDate: string
}) {
  return (
    <div className="card-half">
      {/* Left column - Regulations */}
      <div className="card-column front-left">
        <p><BoldLabelText text={REGULATIONS_TEXT.regulations} /></p>
        <p className="bold-warning">{REGULATIONS_TEXT.sagWagon}</p>
        <p><BoldLabelText text={REGULATIONS_TEXT.controlCard} /></p>
        <p><BoldLabelText text={REGULATIONS_TEXT.conduct} /></p>
        <p><BoldLabelText text={REGULATIONS_TEXT.cycle} /></p>
        <p><BoldLabelText text={REGULATIONS_TEXT.assistance} /></p>
        <div style={{ marginTop: 'auto', paddingTop: '0.2in' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.05in' }}>MACHINE EXAMINER&apos;S STAMP &amp; SIGNATURE</div>
          <div style={{ border: '1px solid #000', height: '0.6in' }}></div>
        </div>
      </div>

      {/* Middle column - Time fields */}
      <div className="card-column front-middle">
        <div className="field-row" style={{ alignItems: 'baseline' }}>
          <div className="field-label">Start:</div>
          <div style={{ fontWeight: 600, fontSize: '9pt' }}>{event.startTime.slice(0, 5)} &middot; {formattedDate}</div>
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
          <div className="field-label" style={{ marginBottom: '0.04in' }}>Total Allowable Time</div>
          <div style={{ display: 'flex', gap: '0.1in', alignItems: 'baseline' }}>
            <span>HRS.</span>
            <span style={{ fontWeight: 700, fontSize: '10pt' }}>{totalAllowableTime.hours}</span>
            <span>MIN.</span>
            <span style={{ fontWeight: 700, fontSize: '10pt' }}>{String(totalAllowableTime.minutes).padStart(2, '0')}</span>
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
      </div>

      {/* Right column - Event and rider info */}
      <div className="card-column front-right">
        <div className="logo-section">
          <Image
            src="/logo-gray.png"
            alt="Randonneurs Ontario"
            width={100}
            height={100}
            style={{ objectFit: 'contain' }}
          />
        </div>

        <div className="card-title">Control Card</div>
        <div className="route-name">{event.routeName}</div>
        <div className="distance-date">{event.distance} km &middot; {formattedDate}</div>

        <div className="rider-info">
          <div className="rider-label">Rider</div>
          <div className="rider-name">
            {rider ? `${rider.firstName} ${rider.lastName}` : ''}
          </div>
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
  const riderName = rider?.firstName || rider?.lastName
    ? `${rider.firstName} ${rider.lastName}`.trim()
    : ''
  // Fill each column completely before moving to the next
  const maxPerColumn = 4
  const column1 = controls.slice(0, maxPerColumn)
  const column2 = controls.slice(maxPerColumn, maxPerColumn * 2)
  const column3 = controls.slice(maxPerColumn * 2, maxPerColumn * 3)

  return (
    <div className="card-half">
      {[column1, column2, column3].map((columnControls, colIndex) => (
        <div key={colIndex} className="card-column back-column">
          {/* Header only on first column or if it's the start of controls */}
          {colIndex === 0 && (
            <div className="back-header">
              <div className="back-header-left" style={{ display: 'flex', alignItems: 'center', gap: '0.1in' }}>
                <Image
                  src="/logo-gray.png"
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
            <div className="back-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700 }}>{event.routeName} {event.distance} km</div>
              <div>{formattedDate}</div>
            </div>
          )}
          {colIndex === 2 && (
            <div className="back-header">
              <div className="back-header-left" style={{ fontWeight: 700 }}>{riderName || '\u00A0'}</div>
            </div>
          )}

          <div className="control-header">
            <div>Control Location</div>
            <div>Time</div>
            <div>Signature</div>
          </div>

          {columnControls.map((control) => (
            <div key={control.id} className="control-row">
              <div className="control-info">
                <div className="control-name">{control.name}</div>
                <div className="control-distance">{control.distance} km</div>
                <div className="control-times">
                  Open: {control.openTime}<br/>
                  Close: {control.closeTime}
                </div>
              </div>
              <div className="time-cell"></div>
              <div className="signature-cell">
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
