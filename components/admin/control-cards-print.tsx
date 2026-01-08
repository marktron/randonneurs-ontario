'use client'

import type { ControlPoint, CardRider, OrganizerInfo, CardEvent } from '@/types/control-card'
import { REGULATIONS_TEXT, EVENT_INFO_TEXT } from '@/types/control-card'
import Image from 'next/image'

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
      {/* Load Noto Sans with variable width axis */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Sans:wdth,wght@62.5..100,100..900&display=swap"
      />
      <style jsx global>{`
        @page {
          size: letter;
          margin: 0;
        }

        @media print {
          html, body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-after: always;
          }
        }

        .control-cards-print {
          font-family: 'Noto Sans', sans-serif;
          font-stretch: 62.5%;
          font-size: 7.5pt;
          line-height: 1.2;
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
          border-bottom: 1px dashed #ccc;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
        }

        .card-half:last-child {
          border-bottom: none;
        }

        .card-column {
          padding: 0.15in;
          border-right: 1px dotted #ddd;
          box-sizing: border-box;
          overflow: hidden;
        }

        .card-column:last-child {
          border-right: none;
        }

        /* Front card styles */
        .front-left {
          font-size: 6.5pt;
          line-height: 1.15;
        }

        .front-left p {
          margin: 0 0 0.5em 0;
        }

        .front-left .bold-warning {
          font-weight: 700;
          margin: 0.5em 0;
        }

        .front-middle {
          display: flex;
          flex-direction: column;
          gap: 0.1in;
        }

        .field-row {
          display: flex;
          gap: 0.1in;
        }

        .field-label {
          font-size: 6.5pt;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .field-box {
          border-bottom: 1px solid #000;
          flex: 1;
          min-height: 0.25in;
        }

        .field-box-tall {
          border: 1px solid #000;
          flex: 1;
          min-height: 0.5in;
        }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 0.1in;
        }

        .checkbox {
          width: 0.15in;
          height: 0.15in;
          border: 1px solid #000;
        }

        .front-right {
          display: flex;
          flex-direction: column;
        }

        .logo-section {
          text-align: right;
          margin-bottom: 0.1in;
        }

        .card-title {
          font-size: 10pt;
          font-weight: 700;
          text-transform: uppercase;
          margin-top: 0.1in;
        }

        .route-name {
          font-size: 14pt;
          font-weight: 700;
          margin: 0.05in 0;
        }

        .distance {
          font-size: 12pt;
          font-weight: 700;
        }

        .rider-info {
          margin-top: 0.15in;
          font-size: 8pt;
        }

        .rider-label {
          font-size: 6.5pt;
        }

        .rider-name {
          font-size: 10pt;
          font-weight: 600;
        }

        .event-info {
          margin-top: auto;
          font-size: 6.5pt;
          line-height: 1.3;
        }

        .organizer-section {
          margin-top: 0.1in;
          padding-top: 0.1in;
          border-top: 1px solid #ddd;
        }

        /* Back card styles */
        .back-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.1in;
          padding-bottom: 0.05in;
          border-bottom: 1px solid #000;
        }

        .back-header-left {
          font-weight: 600;
        }

        .back-header-right {
          text-align: right;
        }

        .controls-grid {
          display: contents;
        }

        .control-header {
          display: grid;
          grid-template-columns: 1fr 0.6in 1fr;
          font-size: 6pt;
          text-transform: uppercase;
          border-bottom: 1px solid #000;
          padding-bottom: 0.03in;
          margin-bottom: 0.05in;
        }

        .control-row {
          display: grid;
          grid-template-columns: 1fr 0.6in 1fr;
          min-height: 0.65in;
          border-bottom: 1px solid #ccc;
          padding: 0.03in 0;
        }

        .control-info {
          font-size: 7pt;
        }

        .control-name {
          font-weight: 700;
          text-transform: uppercase;
        }

        .control-distance {
          font-size: 8pt;
        }

        .control-times {
          font-size: 6.5pt;
          color: #333;
        }

        .time-cell {
          border-left: 1px solid #ccc;
          padding-left: 0.05in;
        }

        .signature-cell {
          border-left: 1px solid #ccc;
          padding-left: 0.05in;
        }

        .signature-stamp-box {
          border: 1px solid #ccc;
          height: 0.4in;
          margin-top: 0.03in;
        }

        .back-column {
          display: flex;
          flex-direction: column;
        }

        .back-full-width {
          grid-column: span 3;
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

          {/* BACK PAGE - Controls (reversed order for double-sided printing) */}
          <div className="card-page page-break">
            {/* Reverse order so when printed double-sided, backs align with fronts */}
            {[...pair].reverse().map((rider, riderIndex) => (
              <CardBack
                key={rider?.id || `empty-back-${riderIndex}`}
                event={event}
                controls={controls}
                formattedDate={formattedDate}
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
        <p>{REGULATIONS_TEXT.regulations}</p>
        <p className="bold-warning">{REGULATIONS_TEXT.sagWagon}</p>
        <p>{REGULATIONS_TEXT.controlCard}</p>
        <p>{REGULATIONS_TEXT.conduct}</p>
        <p>{REGULATIONS_TEXT.cycle}</p>
        <p>{REGULATIONS_TEXT.assistance}</p>
        <div style={{ marginTop: 'auto', paddingTop: '0.1in', borderTop: '1px solid #ccc' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.05in' }}>MACHINE EXAMINER&apos;S STAMP &amp; SIGNATURE</div>
          <div style={{ border: '1px solid #000', height: '0.6in' }}></div>
        </div>
      </div>

      {/* Middle column - Time fields */}
      <div className="card-column front-middle">
        <div className="field-row">
          <div style={{ flex: 1 }}>
            <div className="field-label">Scheduled</div>
            <div className="field-label">Start Time:</div>
          </div>
          <div className="field-box"></div>
        </div>

        <div className="field-row">
          <div style={{ flex: 1 }}>
            <div className="field-label">Finish Time:</div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="field-label">Date:</div>
          </div>
        </div>
        <div className="field-row">
          <div className="field-box"></div>
          <div className="field-box"></div>
        </div>

        <div style={{ marginTop: '0.1in' }}>
          <div className="field-label">Total Allowable Time</div>
          <div style={{ display: 'flex', gap: '0.1in', alignItems: 'baseline' }}>
            <span>HRS.</span>
            <span style={{ fontWeight: 700, fontSize: '10pt' }}>{totalAllowableTime.hours}</span>
            <span>MIN.</span>
            <span style={{ fontWeight: 700, fontSize: '10pt' }}>{totalAllowableTime.minutes}</span>
          </div>
        </div>

        <div style={{ marginTop: '0.1in' }}>
          <div className="field-label">Time Rider Completed Distance</div>
          <div className="field-row">
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
          <div className="field-label" style={{ fontStyle: 'italic' }}>Signature of Official</div>
          <div style={{ borderBottom: '1px solid #000', height: '0.4in' }}></div>
        </div>
      </div>

      {/* Right column - Event and rider info */}
      <div className="card-column front-right">
        <div className="logo-section">
          <Image
            src="/logo.png"
            alt="Randonneurs Ontario"
            width={80}
            height={80}
            style={{ objectFit: 'contain' }}
          />
        </div>

        <div className="card-title">Control Card</div>
        <div className="route-name">{event.routeName}</div>
        <div className="distance">{event.distance} km</div>

        <div className="rider-info">
          <div className="rider-label">Rider:</div>
          <div className="rider-name">
            {rider ? `${rider.firstName} ${rider.lastName}` : ''}
          </div>
          <div className="rider-label" style={{ marginTop: '0.05in' }}>Date:</div>
          <div>{formattedDate}</div>
        </div>

        <div className="event-info">
          <div style={{ marginBottom: '0.05in' }}>Number:</div>
          <div>{EVENT_INFO_TEXT.preamble}</div>
          <div style={{ marginTop: '0.05in' }}>{EVENT_INFO_TEXT.emergency}</div>

          <div className="organizer-section">
            <div>Ride Organizer.</div>
            <div style={{ fontWeight: 600 }}>{organizer.name}</div>
            <div>{organizer.phone}</div>
            <div>{organizer.email}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CardBack({
  event,
  controls,
  formattedDate,
}: {
  event: CardEvent
  controls: ControlPoint[]
  formattedDate: string
}) {
  // Split controls across three columns
  const controlsPerColumn = Math.ceil(controls.length / 3)
  const column1 = controls.slice(0, controlsPerColumn)
  const column2 = controls.slice(controlsPerColumn, controlsPerColumn * 2)
  const column3 = controls.slice(controlsPerColumn * 2)

  return (
    <div className="card-half">
      {[column1, column2, column3].map((columnControls, colIndex) => (
        <div key={colIndex} className="card-column back-column">
          {/* Header only on first column or if it's the start of controls */}
          {colIndex === 0 && (
            <div className="back-header">
              <div className="back-header-left">
                <div style={{ fontWeight: 700 }}>Randonneurs Ontario</div>
              </div>
              <div className="back-header-right">
                <div>{formattedDate}</div>
              </div>
            </div>
          )}
          {colIndex === 1 && (
            <div className="back-header">
              <div className="back-header-left">
                <div>{event.routeName} {event.distance} km</div>
              </div>
            </div>
          )}
          {colIndex === 2 && (
            <div className="back-header">
              <div className="back-header-left">&nbsp;</div>
            </div>
          )}

          <div className="control-header">
            <div>Control Location &amp;<br/>Open/Close Time</div>
            <div>Time</div>
            <div>Seal &amp; Signature<br/>of Control</div>
          </div>

          {columnControls.map((control) => (
            <div key={control.id} className="control-row">
              <div className="control-info">
                <div className="control-name">{control.name}</div>
                <div className="control-distance">{control.distance} km</div>
                <div className="control-times">
                  O: {control.openTime}<br/>
                  C: {control.closeTime}
                </div>
              </div>
              <div className="time-cell"></div>
              <div className="signature-cell">
                <div className="signature-stamp-box"></div>
              </div>
            </div>
          ))}

          {/* Fill remaining space with empty rows if needed */}
          {columnControls.length < controlsPerColumn && colIndex < 2 && (
            Array(controlsPerColumn - columnControls.length).fill(0).map((_, i) => (
              <div key={`empty-${i}`} className="control-row" style={{ visibility: 'hidden' }}>
                <div className="control-info">&nbsp;</div>
                <div className="time-cell"></div>
                <div className="signature-cell"></div>
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  )
}
