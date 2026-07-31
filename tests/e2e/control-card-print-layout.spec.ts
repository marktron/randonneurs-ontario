import { test, expect } from '@playwright/test'

/**
 * Layout regression tests for the printed control card back page
 * (/control-cards/print — query-param driven, no auth or seeded data).
 *
 * These assert real geometry, which jsdom/happy-dom cannot do: a control
 * whose name wraps to two lines must not spill its open/close times past the
 * row's bottom border into the next control. Reproduces the Carleton Place
 * 1000 card (19 controls, "dense" tier) where "Charbonneaus Grocery",
 * "White Lake General Store" and "Athens Fresh Market" each wrap.
 */

const CARLETON_PLACE_1000 = [
  { name: 'The Beginning', distance: 0 },
  { name: 'Charbonneaus Grocery', distance: 97.3 },
  { name: 'Subway', distance: 176.5 },
  { name: 'White Lake General Store', distance: 243.7 },
  { name: 'Tim Hortons', distance: 282.3 },
  { name: 'End loop 1', distance: 337.2 },
  { name: 'Begin loop 2', distance: 337.3 },
  { name: 'Circle K', distance: 372 },
  { name: 'Athens Fresh Market', distance: 419.2 },
  { name: 'Subway', distance: 493.4 },
  { name: 'Tim hortons', distance: 578.6 },
  { name: 'End loop 2', distance: 609.8 },
  { name: 'Start loop 3', distance: 609.9 },
  { name: 'Circle K', distance: 675.6 },
  { name: 'Independant Grocer', distance: 732.4 },
  { name: 'Subway', distance: 809.7 },
  { name: 'Mon Voisin', distance: 877.7 },
  { name: 'tim Hortons/ Esso', distance: 945.5 },
  { name: 'The End Congratulations', distance: 1018.4 },
]

/** A 24-control card exercising the "ultra" tier with long names. */
const ULTRA_CONTROLS = Array.from({ length: 24 }, (_, i) => ({
  name:
    i % 3 === 0
      ? `White Lake General Store ${i}`
      : i % 3 === 1
        ? `Athens Fresh Market ${i}`
        : `C${i}`,
  distance: Math.round(i * 41.6 * 10) / 10,
}))

function printUrl(controls: { name: string; distance: number }[], distance: number) {
  const params = new URLSearchParams({
    routeName: 'Carleton Place 1000',
    distance: String(distance),
    eventDate: '2026-08-01',
    startTime: '05:00',
    organizerName: 'Francis Meunier',
    organizerPhone: '613-555-0100',
    organizerEmail: 'organizer@example.com',
    controls: JSON.stringify(controls),
    riders: JSON.stringify([{ firstName: 'Francis', lastName: 'Meunier' }]),
  })
  return `/control-cards/print?${params.toString()}`
}

/**
 * For every control row, the text block inside it must be fully contained by
 * the row box. Overflow means the row's bottom border cuts through the
 * open/close times and the next control's name lands on top of them.
 */
async function findOverflowingRows(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.control-row'))
      .map((row) => {
        const info = row.querySelector('.control-info')
        if (!info) return null
        const rowBox = row.getBoundingClientRect()
        const last = info.lastElementChild ?? info
        const contentBottom = last.getBoundingClientRect().bottom
        // 0.5px tolerance for sub-pixel rounding.
        const overflowPx = contentBottom - rowBox.bottom
        return overflowPx > 0.5
          ? { name: row.querySelector('.control-name')?.textContent ?? '?', overflowPx }
          : null
      })
      .filter((r): r is { name: string; overflowPx: number } => r !== null)
  )
}

/** Rows must not overlap each other vertically within a column. */
async function findOverlappingRows(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.back-column')).flatMap((col) => {
      const rows = Array.from(col.querySelectorAll('.control-row'))
      const bad: { name: string; overlapPx: number }[] = []
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1].getBoundingClientRect()
        const curr = rows[i].getBoundingClientRect()
        const overlapPx = prev.bottom - curr.top
        if (overlapPx > 0.5) {
          bad.push({
            name: rows[i].querySelector('.control-name')?.textContent ?? '?',
            overlapPx,
          })
        }
      }
      return bad
    })
  )
}

/** No row may extend past the bottom edge of the card half that holds it. */
async function findRowsPastCardEdge(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.card-half')).flatMap((half) => {
      const halfBottom = half.getBoundingClientRect().bottom
      return Array.from(half.querySelectorAll('.control-row'))
        .map((row) => {
          const spillPx = row.getBoundingClientRect().bottom - halfBottom
          return spillPx > 0.5
            ? { name: row.querySelector('.control-name')?.textContent ?? '?', spillPx }
            : null
        })
        .filter((r): r is { name: string; spillPx: number } => r !== null)
    })
  )
}

test.describe('Control card print — back page row layout', () => {
  test('long control names do not overflow their row (dense tier)', async ({ page }) => {
    await page.goto(printUrl(CARLETON_PLACE_1000, 1000))
    await page.waitForFunction(() => document.fonts.ready.then(() => true))
    await expect(page.locator('.control-row').first()).toBeVisible()

    // Guard the premise: these names must actually wrap, or the test proves
    // nothing. A wrapped name is taller than a single line at this size.
    const wrappedCount = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.control-name')).filter(
          (el) =>
            el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight) * 1.5
        ).length
    )
    expect(wrappedCount).toBeGreaterThan(0)

    expect(await findOverflowingRows(page)).toEqual([])
    expect(await findOverlappingRows(page)).toEqual([])
    expect(await findRowsPastCardEdge(page)).toEqual([])
  })

  test('long control names do not overflow their row (ultra tier)', async ({ page }) => {
    await page.goto(printUrl(ULTRA_CONTROLS, 1200))
    await page.waitForFunction(() => document.fonts.ready.then(() => true))
    await expect(page.locator('.control-row').first()).toBeVisible()

    expect(await findOverflowingRows(page)).toEqual([])
    expect(await findOverlappingRows(page)).toEqual([])
    expect(await findRowsPastCardEdge(page)).toEqual([])
  })

  /**
   * An `fr` track has an automatic min-content floor, so a control name with
   * no spaces to wrap at does not spill sideways — it widens the name track
   * and squeezes the Time and Signature cells the volunteer has to write in.
   * `overflow-wrap: anywhere` on .control-name keeps min-content small.
   * `break-word` would not: it permits the break but leaves the intrinsic
   * min-content width — which the track floor is measured from — unchanged.
   */
  test('an unbroken long word does not squeeze the Time and Signature cells', async ({ page }) => {
    await page.goto(
      printUrl(
        [
          { name: 'Start', distance: 0 },
          // No spaces to wrap at, and comfortably wider than the name cell.
          { name: 'Charbonneausgroceryandgeneralstoreextended', distance: 100 },
          { name: 'Finish', distance: 200 },
        ],
        200
      )
    )
    await page.waitForFunction(() => document.fonts.ready.then(() => true))
    await expect(page.locator('.control-row').first()).toBeVisible()

    // The Time column is a fixed 0.55in ≈ 52.8px at 96dpi; allow a little
    // slack for rounding but catch any real collapse.
    const cellWidths = await page.evaluate(() => ({
      time: Math.min(
        ...Array.from(document.querySelectorAll('.time-cell')).map(
          (el) => el.getBoundingClientRect().width
        )
      ),
      signature: Math.min(
        ...Array.from(document.querySelectorAll('.signature-cell')).map(
          (el) => el.getBoundingClientRect().width
        )
      ),
    }))
    expect(cellWidths.time).toBeGreaterThan(50)
    expect(cellWidths.signature).toBeGreaterThan(60)

    // And the name still must not overflow its row vertically.
    expect(await findOverflowingRows(page)).toEqual([])
  })
})
