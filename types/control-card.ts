import type { NominalDistance } from '@/lib/brmTimes'

/**
 * A control point on a route
 */
export interface ControlPoint {
  id: string
  name: string
  distance: number // km from start
  openTime: string // formatted time like "Thu 04h30"
  closeTime: string // formatted time like "Thu 05h30"
}

/**
 * Rider information for a control card
 */
export interface CardRider {
  id: string
  firstName: string
  lastName: string
}

/**
 * Event organizer details for the control card
 */
export interface OrganizerInfo {
  name: string
  phone: string
  email: string
}

/**
 * Event information for control cards
 */
export interface CardEvent {
  id: string
  name: string
  routeName: string
  distance: number // actual distance in km
  nominalDistance: NominalDistance
  date: Date
  startTime: string // formatted start time
  startLocation: string
  chapter: string
}

/**
 * Complete data for generating control cards
 */
export interface ControlCardData {
  event: CardEvent
  organizer: OrganizerInfo
  controls: ControlPoint[]
  riders: CardRider[]
  totalAllowableTime: {
    hours: number
    minutes: number
  }
}

/**
 * Input data for generating control cards (from the form)
 */
export interface ControlCardInput {
  eventId: string
  organizerName: string
  organizerPhone: string
  organizerEmail: string
  controls: {
    name: string
    distance: number
  }[]
}

/**
 * Regulations text for the front of the control card
 */
export const REGULATIONS_TEXT = {
  regulations: `REGULATIONS: Each participant is to be considered a private excursion and remains responsible for any accidents in which they may be involved. Each participant is responsible for following the route. Although Randonneurs Ontario will endeavor to ensure that all route instructions are correct, no responsibility can be accepted for participants becoming lost. Should a participant become lost or stranded by mechanical problems or fatigue, it will be their responsibility to get home.`,

  sagWagon: `There will be no "sag wagon"`,

  controlCard: `CONTROL CARD: The participant to whom this card is issued must present it at each control for the official stamp, signature and control time. Loss of this card, or absence of any of the control stamps, or any irregularity in stamping or signing of the card will result in disqualification.`,

  conduct: `CONDUCT: Participants must at all times obey the rules of the road and conduct themselves in a manner which will not discredit the Randonneurs Ontario organization. Failure to do so will result in disqualification.`,

  cycle: `CYCLE: Any cycle permitted (bicycle, tandem, tricycle etc.) providing it is powered by muscle power alone. Powerful front and rear lights must be attached to the cycle night and day. The cycle must be in good mechanical condition to participate in the event.`,

  assistance: `ASSISTANCE: Each participant must provide for his/her needs during the event. Following vehicles are not permitted. Mechanical and personal assistance may only be received at control points.`,
}

export const EVENT_INFO_TEXT = {
  preamble: `Event Organized Under the Rules and Regulations of Les Randonneurs Mondiaux.`,
  emergency: `Emergency Services: 911`,
}
