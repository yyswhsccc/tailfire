// apps/api/src/destinations/country-data.ts

export interface CountryInfo {
  name: string
  currency: string
  currencyName: string
  languages: string[]
  visaForCA: string
  drivingSide: 'left' | 'right'
  electricPlug: string
  emergencyNumber: string
  dialCode: string
}

export const COUNTRY_DATA: Record<string, CountryInfo> = {
  // Americas
  US: { name: 'United States', currency: 'USD', currencyName: 'US Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1' },
  MX: { name: 'Mexico', currency: 'MXN', currencyName: 'Mexican Peso', languages: ['Spanish'], visaForCA: 'Not required (180 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+52' },
  CA: { name: 'Canada', currency: 'CAD', currencyName: 'Canadian Dollar', languages: ['English', 'French'], visaForCA: 'N/A (home)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1' },
  BS: { name: 'Bahamas', currency: 'BSD', currencyName: 'Bahamian Dollar', languages: ['English'], visaForCA: 'Not required (8 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911/919', dialCode: '+1-242' },
  JM: { name: 'Jamaica', currency: 'JMD', currencyName: 'Jamaican Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '119', dialCode: '+1-876' },
  BB: { name: 'Barbados', currency: 'BBD', currencyName: 'Barbadian Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '211', dialCode: '+1-246' },
  BM: { name: 'Bermuda', currency: 'BMD', currencyName: 'Bermudian Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-441' },
  AW: { name: 'Aruba', currency: 'AWG', currencyName: 'Aruban Florin', languages: ['Dutch', 'Papiamento'], visaForCA: 'Not required (30 days)', drivingSide: 'right', electricPlug: 'A/B/F', emergencyNumber: '911', dialCode: '+297' },
  KY: { name: 'Cayman Islands', currency: 'KYD', currencyName: 'Cayman Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-345' },
  CR: { name: 'Costa Rica', currency: 'CRC', currencyName: 'Costa Rican Colón', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+506' },
  PA: { name: 'Panama', currency: 'USD', currencyName: 'US Dollar / Balboa', languages: ['Spanish'], visaForCA: 'Not required (180 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+507' },
  CO: { name: 'Colombia', currency: 'COP', currencyName: 'Colombian Peso', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '123', dialCode: '+57' },
  CL: { name: 'Chile', currency: 'CLP', currencyName: 'Chilean Peso', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/L', emergencyNumber: '131', dialCode: '+56' },
  BR: { name: 'Brazil', currency: 'BRL', currencyName: 'Brazilian Real', languages: ['Portuguese'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/N', emergencyNumber: '190', dialCode: '+55' },
  AR: { name: 'Argentina', currency: 'ARS', currencyName: 'Argentine Peso', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/I', emergencyNumber: '911', dialCode: '+54' },
  BZ: { name: 'Belize', currency: 'BZD', currencyName: 'Belize Dollar', languages: ['English'], visaForCA: 'Not required (30 days)', drivingSide: 'right', electricPlug: 'A/B/G', emergencyNumber: '911', dialCode: '+501' },
  HN: { name: 'Honduras', currency: 'HNL', currencyName: 'Honduran Lempira', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '199', dialCode: '+504' },
  CU: { name: 'Cuba', currency: 'CUP', currencyName: 'Cuban Peso', languages: ['Spanish'], visaForCA: 'Tourist card required', drivingSide: 'right', electricPlug: 'A/B/C', emergencyNumber: '106', dialCode: '+53' },
  DO: { name: 'Dominican Republic', currency: 'DOP', currencyName: 'Dominican Peso', languages: ['Spanish'], visaForCA: 'Tourist card on arrival', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-809' },
  PR: { name: 'Puerto Rico', currency: 'USD', currencyName: 'US Dollar', languages: ['Spanish', 'English'], visaForCA: 'Not required (US territory)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-787' },
  EC: { name: 'Ecuador', currency: 'USD', currencyName: 'US Dollar', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+593' },
  PE: { name: 'Peru', currency: 'PEN', currencyName: 'Peruvian Sol', languages: ['Spanish'], visaForCA: 'Not required (183 days)', drivingSide: 'right', electricPlug: 'A/B/C', emergencyNumber: '105', dialCode: '+51' },

  // Europe
  GB: { name: 'United Kingdom', currency: 'GBP', currencyName: 'British Pound', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+44' },
  FR: { name: 'France', currency: 'EUR', currencyName: 'Euro', languages: ['French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '112', dialCode: '+33' },
  ES: { name: 'Spain', currency: 'EUR', currencyName: 'Euro', languages: ['Spanish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+34' },
  IT: { name: 'Italy', currency: 'EUR', currencyName: 'Euro', languages: ['Italian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F/L', emergencyNumber: '112', dialCode: '+39' },
  GR: { name: 'Greece', currency: 'EUR', currencyName: 'Euro', languages: ['Greek'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+30' },
  TR: { name: 'Turkey', currency: 'TRY', currencyName: 'Turkish Lira', languages: ['Turkish'], visaForCA: 'e-Visa required', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+90' },
  DE: { name: 'Germany', currency: 'EUR', currencyName: 'Euro', languages: ['German'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+49' },
  NO: { name: 'Norway', currency: 'NOK', currencyName: 'Norwegian Krone', languages: ['Norwegian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+47' },
  DK: { name: 'Denmark', currency: 'DKK', currencyName: 'Danish Krone', languages: ['Danish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E/F/K', emergencyNumber: '112', dialCode: '+45' },
  SE: { name: 'Sweden', currency: 'SEK', currencyName: 'Swedish Krona', languages: ['Swedish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+46' },
  NL: { name: 'Netherlands', currency: 'EUR', currencyName: 'Euro', languages: ['Dutch'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+31' },
  PT: { name: 'Portugal', currency: 'EUR', currencyName: 'Euro', languages: ['Portuguese'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+351' },
  HR: { name: 'Croatia', currency: 'EUR', currencyName: 'Euro', languages: ['Croatian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+385' },
  ME: { name: 'Montenegro', currency: 'EUR', currencyName: 'Euro', languages: ['Montenegrin'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+382' },
  IE: { name: 'Ireland', currency: 'EUR', currencyName: 'Euro', languages: ['English', 'Irish'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '112/999', dialCode: '+353' },
  IS: { name: 'Iceland', currency: 'ISK', currencyName: 'Icelandic Króna', languages: ['Icelandic'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+354' },
  MT: { name: 'Malta', currency: 'EUR', currencyName: 'Euro', languages: ['Maltese', 'English'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '112', dialCode: '+356' },
  CY: { name: 'Cyprus', currency: 'EUR', currencyName: 'Euro', languages: ['Greek', 'Turkish'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '112', dialCode: '+357' },

  // Asia & Middle East
  JP: { name: 'Japan', currency: 'JPY', currencyName: 'Japanese Yen', languages: ['Japanese'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '110', dialCode: '+81' },
  SG: { name: 'Singapore', currency: 'SGD', currencyName: 'Singapore Dollar', languages: ['English', 'Mandarin', 'Malay', 'Tamil'], visaForCA: 'Not required (30 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+65' },
  TH: { name: 'Thailand', currency: 'THB', currencyName: 'Thai Baht', languages: ['Thai'], visaForCA: 'Not required (30 days)', drivingSide: 'left', electricPlug: 'A/B/C', emergencyNumber: '191', dialCode: '+66' },
  AE: { name: 'United Arab Emirates', currency: 'AED', currencyName: 'UAE Dirham', languages: ['Arabic', 'English'], visaForCA: 'Not required (30 days)', drivingSide: 'right', electricPlug: 'G', emergencyNumber: '999', dialCode: '+971' },
  IL: { name: 'Israel', currency: 'ILS', currencyName: 'Israeli Shekel', languages: ['Hebrew', 'Arabic'], visaForCA: 'Not required (3 months)', drivingSide: 'right', electricPlug: 'C/H', emergencyNumber: '100', dialCode: '+972' },
  IN: { name: 'India', currency: 'INR', currencyName: 'Indian Rupee', languages: ['Hindi', 'English'], visaForCA: 'e-Visa required', drivingSide: 'left', electricPlug: 'C/D/M', emergencyNumber: '112', dialCode: '+91' },
  VN: { name: 'Vietnam', currency: 'VND', currencyName: 'Vietnamese Dong', languages: ['Vietnamese'], visaForCA: 'e-Visa required', drivingSide: 'right', electricPlug: 'A/B/C', emergencyNumber: '113', dialCode: '+84' },
  MY: { name: 'Malaysia', currency: 'MYR', currencyName: 'Malaysian Ringgit', languages: ['Malay', 'English'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+60' },
  ID: { name: 'Indonesia', currency: 'IDR', currencyName: 'Indonesian Rupiah', languages: ['Indonesian'], visaForCA: 'Visa on arrival (30 days)', drivingSide: 'left', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+62' },
  PH: { name: 'Philippines', currency: 'PHP', currencyName: 'Philippine Peso', languages: ['Filipino', 'English'], visaForCA: 'Not required (30 days)', drivingSide: 'right', electricPlug: 'A/B/C', emergencyNumber: '911', dialCode: '+63' },
  CN: { name: 'China', currency: 'CNY', currencyName: 'Chinese Yuan', languages: ['Mandarin'], visaForCA: 'Visa required', drivingSide: 'right', electricPlug: 'A/C/I', emergencyNumber: '110', dialCode: '+86' },
  KR: { name: 'South Korea', currency: 'KRW', currencyName: 'South Korean Won', languages: ['Korean'], visaForCA: 'Not required (6 months)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+82' },
  OM: { name: 'Oman', currency: 'OMR', currencyName: 'Omani Rial', languages: ['Arabic'], visaForCA: 'Visa on arrival (30 days)', drivingSide: 'right', electricPlug: 'G', emergencyNumber: '9999', dialCode: '+968' },
  QA: { name: 'Qatar', currency: 'QAR', currencyName: 'Qatari Riyal', languages: ['Arabic', 'English'], visaForCA: 'Visa on arrival (30 days)', drivingSide: 'right', electricPlug: 'G', emergencyNumber: '999', dialCode: '+974' },
  BH: { name: 'Bahrain', currency: 'BHD', currencyName: 'Bahraini Dinar', languages: ['Arabic'], visaForCA: 'Visa on arrival (14 days)', drivingSide: 'right', electricPlug: 'G', emergencyNumber: '999', dialCode: '+973' },
  JO: { name: 'Jordan', currency: 'JOD', currencyName: 'Jordanian Dinar', languages: ['Arabic'], visaForCA: 'Visa on arrival', drivingSide: 'right', electricPlug: 'B/C/D/F/G/J', emergencyNumber: '911', dialCode: '+962' },
  LK: { name: 'Sri Lanka', currency: 'LKR', currencyName: 'Sri Lankan Rupee', languages: ['Sinhala', 'Tamil'], visaForCA: 'ETA required', drivingSide: 'left', electricPlug: 'D/G', emergencyNumber: '119', dialCode: '+94' },

  // Oceania
  AU: { name: 'Australia', currency: 'AUD', currencyName: 'Australian Dollar', languages: ['English'], visaForCA: 'eTA required', drivingSide: 'left', electricPlug: 'I', emergencyNumber: '000', dialCode: '+61' },
  NZ: { name: 'New Zealand', currency: 'NZD', currencyName: 'New Zealand Dollar', languages: ['English', 'Māori'], visaForCA: 'NZeTA required', drivingSide: 'left', electricPlug: 'I', emergencyNumber: '111', dialCode: '+64' },
  FJ: { name: 'Fiji', currency: 'FJD', currencyName: 'Fijian Dollar', languages: ['English', 'Fijian'], visaForCA: 'Not required (4 months)', drivingSide: 'left', electricPlug: 'I', emergencyNumber: '917', dialCode: '+679' },
  PF: { name: 'French Polynesia', currency: 'XPF', currencyName: 'CFP Franc', languages: ['French', 'Tahitian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'A/B/C/E', emergencyNumber: '17', dialCode: '+689' },

  // Africa
  EG: { name: 'Egypt', currency: 'EGP', currencyName: 'Egyptian Pound', languages: ['Arabic'], visaForCA: 'Visa on arrival', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '122', dialCode: '+20' },
  MA: { name: 'Morocco', currency: 'MAD', currencyName: 'Moroccan Dirham', languages: ['Arabic', 'French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '19', dialCode: '+212' },
  ZA: { name: 'South Africa', currency: 'ZAR', currencyName: 'South African Rand', languages: ['English', 'Afrikaans', 'Zulu'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'C/M/N', emergencyNumber: '10111', dialCode: '+27' },
  KE: { name: 'Kenya', currency: 'KES', currencyName: 'Kenyan Shilling', languages: ['Swahili', 'English'], visaForCA: 'eVisa required', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+254' },
  TZ: { name: 'Tanzania', currency: 'TZS', currencyName: 'Tanzanian Shilling', languages: ['Swahili', 'English'], visaForCA: 'Visa on arrival', drivingSide: 'left', electricPlug: 'D/G', emergencyNumber: '112', dialCode: '+255' },
  SC: { name: 'Seychelles', currency: 'SCR', currencyName: 'Seychellois Rupee', languages: ['English', 'French', 'Creole'], visaForCA: 'Not required (3 months)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+248' },
  MU: { name: 'Mauritius', currency: 'MUR', currencyName: 'Mauritian Rupee', languages: ['English', 'French', 'Creole'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'C/G', emergencyNumber: '999', dialCode: '+230' },
  MV: { name: 'Maldives', currency: 'MVR', currencyName: 'Maldivian Rufiyaa', languages: ['Dhivehi'], visaForCA: 'Visa on arrival (30 days)', drivingSide: 'left', electricPlug: 'A/D/G/J/K/L', emergencyNumber: '119', dialCode: '+960' },
  CI: { name: 'Ivory Coast', currency: 'XOF', currencyName: 'West African CFA Franc', languages: ['French'], visaForCA: 'Visa required', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '110', dialCode: '+225' },
  SL: { name: 'Sierra Leone', currency: 'SLL', currencyName: 'Sierra Leonean Leone', languages: ['English'], visaForCA: 'Visa required', drivingSide: 'right', electricPlug: 'D/G', emergencyNumber: '999', dialCode: '+232' },
  SN: { name: 'Senegal', currency: 'XOF', currencyName: 'West African CFA Franc', languages: ['French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/D/E/K', emergencyNumber: '17', dialCode: '+221' },
  NA: { name: 'Namibia', currency: 'NAD', currencyName: 'Namibian Dollar', languages: ['English'], visaForCA: 'Not required (90 days)', drivingSide: 'left', electricPlug: 'D/M', emergencyNumber: '10111', dialCode: '+264' },
  MG: { name: 'Madagascar', currency: 'MGA', currencyName: 'Malagasy Ariary', languages: ['Malagasy', 'French'], visaForCA: 'Visa on arrival', drivingSide: 'right', electricPlug: 'C/D/E/J/K', emergencyNumber: '117', dialCode: '+261' },

  // Caribbean islands
  GD: { name: 'Grenada', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '911', dialCode: '+1-473' },
  AG: { name: 'Antigua and Barbuda', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-268' },
  LC: { name: 'Saint Lucia', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 weeks)', drivingSide: 'left', electricPlug: 'G', emergencyNumber: '999', dialCode: '+1-758' },
  TT: { name: 'Trinidad and Tobago', currency: 'TTD', currencyName: 'Trinidad Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '999', dialCode: '+1-868' },
  DM: { name: 'Dominica', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'D/G', emergencyNumber: '999', dialCode: '+1-767' },
  VC: { name: 'Saint Vincent', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (1 month)', drivingSide: 'left', electricPlug: 'A/C/E/G/I/K', emergencyNumber: '999', dialCode: '+1-784' },
  KN: { name: 'Saint Kitts and Nevis', currency: 'XCD', currencyName: 'East Caribbean Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B/D/G', emergencyNumber: '911', dialCode: '+1-869' },
  CW: { name: 'Curaçao', currency: 'ANG', currencyName: 'Netherlands Antillean Guilder', languages: ['Dutch', 'Papiamentu'], visaForCA: 'Not required (3 months)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+599' },
  SX: { name: 'Sint Maarten', currency: 'ANG', currencyName: 'Netherlands Antillean Guilder', languages: ['Dutch', 'English'], visaForCA: 'Not required (3 months)', drivingSide: 'right', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-721' },
  MQ: { name: 'Martinique', currency: 'EUR', currencyName: 'Euro', languages: ['French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/D/E', emergencyNumber: '112', dialCode: '+596' },
  GP: { name: 'Guadeloupe', currency: 'EUR', currencyName: 'Euro', languages: ['French'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/D/E', emergencyNumber: '112', dialCode: '+590' },
  VI: { name: 'US Virgin Islands', currency: 'USD', currencyName: 'US Dollar', languages: ['English'], visaForCA: 'Not required (US territory)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911', dialCode: '+1-340' },
  VG: { name: 'British Virgin Islands', currency: 'USD', currencyName: 'US Dollar', languages: ['English'], visaForCA: 'Not required (6 months)', drivingSide: 'left', electricPlug: 'A/B', emergencyNumber: '911/999', dialCode: '+1-284' },

  // Additional
  RU: { name: 'Russia', currency: 'RUB', currencyName: 'Russian Ruble', languages: ['Russian'], visaForCA: 'Visa required', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+7' },
  FI: { name: 'Finland', currency: 'EUR', currencyName: 'Euro', languages: ['Finnish', 'Swedish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+358' },
  EE: { name: 'Estonia', currency: 'EUR', currencyName: 'Euro', languages: ['Estonian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+372' },
  LV: { name: 'Latvia', currency: 'EUR', currencyName: 'Euro', languages: ['Latvian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+371' },
  LT: { name: 'Lithuania', currency: 'EUR', currencyName: 'Euro', languages: ['Lithuanian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+370' },
  PL: { name: 'Poland', currency: 'PLN', currencyName: 'Polish Złoty', languages: ['Polish'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '112', dialCode: '+48' },
  BE: { name: 'Belgium', currency: 'EUR', currencyName: 'Euro', languages: ['Dutch', 'French', 'German'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/E', emergencyNumber: '112', dialCode: '+32' },
  SI: { name: 'Slovenia', currency: 'EUR', currencyName: 'Euro', languages: ['Slovenian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+386' },
  AT: { name: 'Austria', currency: 'EUR', currencyName: 'Euro', languages: ['German'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/F', emergencyNumber: '112', dialCode: '+43' },
  CH: { name: 'Switzerland', currency: 'CHF', currencyName: 'Swiss Franc', languages: ['German', 'French', 'Italian'], visaForCA: 'Not required (90 days)', drivingSide: 'right', electricPlug: 'C/J', emergencyNumber: '112', dialCode: '+41' },
}

/**
 * Look up country info by 2-letter ISO code.
 * Returns undefined for unknown country codes.
 */
export function getCountryInfo(countryCode: string): CountryInfo | undefined {
  return COUNTRY_DATA[countryCode.toUpperCase()]
}
