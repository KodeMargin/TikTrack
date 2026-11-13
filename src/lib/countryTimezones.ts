import ct from 'countries-and-timezones'

export interface CountryItem {
  code: string // e.g. "LK"
  name: string // e.g. "Sri Lanka"
  flag: string // e.g. "🇱🇰"
  dialCode: string // e.g. "+94"
  timezones: string[] // e.g. ["Asia/Colombo"]
  defaultTimezone: string // e.g. "Asia/Colombo"
}

export interface TimezoneOption {
  name: string // e.g. "Asia/Colombo"
  label: string // e.g. "(GMT+05:30) Asia/Colombo"
  offsetStr: string // e.g. "+05:30"
  countryCode?: string
}

// Map of standard country calling codes (ISO2 -> E.164 calling code prefix)
const DIAL_CODES: Record<string, string> = {
  AF: '+93', AL: '+355', DZ: '+213', AS: '+1-684', AD: '+376', AO: '+244', AI: '+1-264',
  AQ: '+672', AG: '+1-268', AR: '+54', AM: '+374', AW: '+297', AU: '+61', AT: '+43',
  AZ: '+994', BS: '+1-242', BH: '+973', BD: '+880', BB: '+1-246', BY: '+375', BE: '+32',
  BZ: '+501', BJ: '+229', BM: '+1-441', BT: '+975', BO: '+591', BA: '+387', BW: '+267',
  BR: '+55', IO: '+246', VG: '+1-284', BN: '+673', BG: '+359', BF: '+226', BI: '+257',
  KH: '+855', CM: '+237', CA: '+1', CV: '+238', KY: '+1-345', CF: '+236', TD: '+235',
  CL: '+56', CN: '+86', CX: '+61', CC: '+61', CO: '+57', KM: '+269', CK: '+682',
  CR: '+506', HR: '+385', CU: '+53', CW: '+599', CY: '+357', CZ: '+420', CD: '+243',
  DK: '+45', DJ: '+253', DM: '+1-767', DO: '+1-809', EC: '+593', EG: '+20', SV: '+503',
  GQ: '+240', ER: '+291', EE: '+372', SZ: '+268', ET: '+251', FK: '+500', FO: '+298',
  FJ: '+679', FI: '+358', FR: '+33', GF: '+594', PF: '+689', GA: '+241', GM: '+220',
  GE: '+995', DE: '+49', GH: '+233', GI: '+350', GR: '+30', GL: '+299', GD: '+1-473',
  GP: '+590', GU: '+1-671', GT: '+502', GG: '+44', GN: '+224', GW: '+245', GY: '+592',
  HT: '+509', HN: '+504', HK: '+852', HU: '+36', IS: '+354', IN: '+91', ID: '+62',
  IR: '+98', IQ: '+964', IE: '+353', IM: '+44', IL: '+972', IT: '+39', CI: '+225',
  JM: '+1-876', JP: '+81', JE: '+44', JO: '+962', KZ: '+7', KE: '+254', KI: '+686',
  XK: '+383', KW: '+965', KG: '+996', LA: '+856', LV: '+371', LB: '+961', LS: '+266',
  LR: '+231', LY: '+218', LI: '+423', LT: '+370', LU: '+352', MO: '+853', MG: '+261',
  MW: '+265', MY: '+60', MV: '+960', ML: '+223', MT: '+356', MH: '+692', MQ: '+596',
  MR: '+222', MU: '+230', YT: '+262', MX: '+52', FM: '+691', MD: '+373', MC: '+377',
  MN: '+976', ME: '+382', MS: '+1-664', MA: '+212', MZ: '+258', MM: '+95', NA: '+264',
  NR: '+674', NP: '+977', NL: '+31', NC: '+687', NZ: '+64', NI: '+505', NE: '+227',
  NG: '+234', NU: '+683', NF: '+672', KP: '+850', MK: '+389', MP: '+1-670', NO: '+47',
  OM: '+968', PK: '+92', PW: '+680', PS: '+970', PA: '+507', PG: '+675', PY: '+595',
  PE: '+51', PH: '+63', PL: '+48', PT: '+351', PR: '+1-787', QA: '+974', RE: '+262',
  RO: '+40', RU: '+7', RW: '+250', BL: '+590', SH: '+290', KN: '+1-869', LC: '+1-758',
  MF: '+590', PM: '+508', VC: '+1-784', WS: '+685', SM: '+378', ST: '+239', SA: '+966',
  SN: '+221', RS: '+381', SC: '+248', SL: '+232', SG: '+65', SX: '+1-721', SK: '+421',
  SI: '+386', SB: '+677', SO: '+252', ZA: '+27', KR: '+82', SS: '+211', ES: '+34',
  LK: '+94', SD: '+249', SR: '+597', SE: '+46', CH: '+41', SY: '+963', TW: '+886',
  TJ: '+992', TZ: '+255', TH: '+66', TL: '+670', TG: '+228', TK: '+690', TO: '+676',
  TT: '+1-868', TN: '+216', TR: '+90', TM: '+993', TC: '+1-649', TV: '+688', UG: '+256',
  UA: '+380', AE: '+971', GB: '+44', US: '+1', UY: '+598', UZ: '+998', VU: '+678',
  VA: '+39-06', VE: '+58', VN: '+84', VI: '+1-340', YE: '+967', ZM: '+260', ZW: '+263',
}

/**
 * Derives Unicode flag emoji from a 2-letter ISO country code.
 */
export function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐'
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

/**
 * Returns formatted timezone label e.g. "(GMT+05:30) Asia/Colombo"
 */
export function formatTimezoneLabel(tzName: string): string {
  const tz = ct.getTimezone(tzName)
  if (!tz) return tzName
  const offset = tz.utcOffsetStr || '+00:00'
  return `(GMT${offset}) ${tz.name}`
}

/**
 * Returns full array of countries with ISO code, name, flag, dial code and timezones.
 */
export function getAllCountries(): CountryItem[] {
  const raw = ct.getAllCountries()
  return Object.values(raw)
    .map((c) => {
      const code = c.id
      const timezones = c.timezones ?? []
      return {
        code,
        name: c.name,
        flag: getCountryFlag(code),
        dialCode: DIAL_CODES[code] || '',
        timezones,
        defaultTimezone: timezones[0] || 'UTC',
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Detects the user's local timezone & corresponding country from browser runtime.
 */
export function detectUserLocation(): {
  countryCode: string
  timezone: string
} {
  let detectedTz = 'Asia/Colombo'
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) detectedTz = tz
  } catch {
    // fallback
  }

  const country = ct.getCountryForTimezone(detectedTz)
  return {
    countryCode: country?.id || 'LK',
    timezone: detectedTz,
  }
}

/**
 * Gets timezone options for a specific country or all if none provided.
 */
export function getTimezoneOptionsForCountry(countryCode?: string): TimezoneOption[] {
  if (countryCode) {
    const country = ct.getCountry(countryCode)
    if (country && country.timezones.length > 0) {
      return country.timezones.map((tzName) => {
        const tz = ct.getTimezone(tzName)
        const offset = tz?.utcOffsetStr || '+00:00'
        return {
          name: tzName,
          label: `(GMT${offset}) ${tzName}`,
          offsetStr: offset,
          countryCode,
        }
      })
    }
  }

  // All timezones fallback
  const allTzs = ct.getAllTimezones()
  return Object.values(allTzs)
    .map((t) => ({
      name: t.name,
      label: `(GMT${t.utcOffsetStr || '+00:00'}) ${t.name}`,
      offsetStr: t.utcOffsetStr || '+00:00',
      countryCode: t.countries[0],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

