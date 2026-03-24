/**
 * Dynamo Retail Group — huisstijl
 * - Donkerblauw (hoofd): #2D457C
 * - Lichtblauw (secundair): #6691AE
 */
export const DYNAMO_BLUE = '#2D457C'
/** Lichtblauw — accenten, randen, secundaire tekst (niet voor kleine lichaamstekst op wit als contrast te laag is) */
export const DYNAMO_BLUE_LIGHT = '#6691AE'
export const DYNAMO_GOLD = '#f0c040'
export const DYNAMO_LOGO = '/dynamo-retail-group-logo.png'
export const FONT_FAMILY = "'Outfit', sans-serif"

export const DYNAMO_BLUE_RGB = '45, 69, 124'
export const DYNAMO_BLUE_LIGHT_RGB = '102, 145, 174'

/** Dashboard / portal: donkerblauw + lichtblauw uit de DRG-palet */
export const dashboardUi = {
  /** Pagina: zeer licht, licht naar lichtblauw getint */
  pageBg: '#f0f3f8',
  /** Onderteksten bij modules (donkerblauw, leesbaar op wit) */
  textMuted: `rgba(${DYNAMO_BLUE_RGB}, 0.52)`,
  /** Labels / secundair (lichtblauw) */
  textSecondary: DYNAMO_BLUE_LIGHT,
  textSubtle: `rgba(${DYNAMO_BLUE_LIGHT_RGB}, 0.85)`,
  borderSoft: `rgba(${DYNAMO_BLUE_LIGHT_RGB}, 0.38)`,
  borderMedium: `rgba(${DYNAMO_BLUE_LIGHT_RGB}, 0.5)`,
  cardWhite: {
    background: '#ffffff',
    border: `1px solid rgba(${DYNAMO_BLUE_LIGHT_RGB}, 0.42)`,
    boxShadow: `0 4px 22px rgba(${DYNAMO_BLUE_RGB}, 0.07)`,
  },
  cardFooter: {
    background: `rgba(${DYNAMO_BLUE_LIGHT_RGB}, 0.08)`,
    borderTop: `1px solid rgba(${DYNAMO_BLUE_LIGHT_RGB}, 0.22)`,
  },
  cardHoverShadow: `0 14px 42px rgba(${DYNAMO_BLUE_RGB}, 0.12)`,
  sectionDivider: `rgba(${DYNAMO_BLUE_LIGHT_RGB}, 0.35)`,
  /** Subtiele lichtblauwe gloed op hero (leesbaarheid tekst blijft: donkerblauw als basis) */
  heroAccentWash: `linear-gradient(200deg, transparent 35%, rgba(${DYNAMO_BLUE_LIGHT_RGB}, 0.22) 100%)`,
} as const

export const WINKEL_KLEUREN = [
  '#2D457C', '#16a34a', '#dc2626', '#9333ea',
  '#ea580c', '#0891b2', '#65a30d', '#db2777',
]
