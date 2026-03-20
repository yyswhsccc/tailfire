/**
 * Static Airport Data
 *
 * Fallback lookup for airport information when not available from API.
 * Contains ~300 major international airports with name, city, country, and coordinates.
 *
 * Data source: Public IATA airport database
 * Usage: Falls back to this when airport details aren't persisted from Aerodatabox API
 */

export interface StaticAirportData {
  name: string
  city: string
  country: string
  lat: number
  lon: number
}

/**
 * Major international airports indexed by IATA code
 */
export const AIRPORTS: Record<string, StaticAirportData> = {
  // North America - Canada
  YYZ: { name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'CA', lat: 43.6777, lon: -79.6248 },
  YVR: { name: 'Vancouver International Airport', city: 'Vancouver', country: 'CA', lat: 49.1967, lon: -123.1815 },
  YUL: { name: 'Montreal-Trudeau International Airport', city: 'Montreal', country: 'CA', lat: 45.4706, lon: -73.7408 },
  YYC: { name: 'Calgary International Airport', city: 'Calgary', country: 'CA', lat: 51.1215, lon: -114.0076 },
  YEG: { name: 'Edmonton International Airport', city: 'Edmonton', country: 'CA', lat: 53.3097, lon: -113.5803 },
  YOW: { name: 'Ottawa Macdonald-Cartier International Airport', city: 'Ottawa', country: 'CA', lat: 45.3225, lon: -75.6692 },
  YWG: { name: 'Winnipeg James Armstrong Richardson International Airport', city: 'Winnipeg', country: 'CA', lat: 49.9100, lon: -97.2398 },
  YHZ: { name: 'Halifax Stanfield International Airport', city: 'Halifax', country: 'CA', lat: 44.8808, lon: -63.5086 },
  YQB: { name: 'Quebec City Jean Lesage International Airport', city: 'Quebec City', country: 'CA', lat: 46.7911, lon: -71.3933 },
  YYJ: { name: 'Victoria International Airport', city: 'Victoria', country: 'CA', lat: 48.6469, lon: -123.4258 },
  YXE: { name: 'Saskatoon John G. Diefenbaker International Airport', city: 'Saskatoon', country: 'CA', lat: 52.1708, lon: -106.6997 },
  YQR: { name: 'Regina International Airport', city: 'Regina', country: 'CA', lat: 50.4319, lon: -104.6658 },

  // North America - United States (Major Hubs)
  ATL: { name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', country: 'US', lat: 33.6407, lon: -84.4277 },
  LAX: { name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'US', lat: 33.9416, lon: -118.4085 },
  ORD: { name: "O'Hare International Airport", city: 'Chicago', country: 'US', lat: 41.9742, lon: -87.9073 },
  DFW: { name: 'Dallas/Fort Worth International Airport', city: 'Dallas', country: 'US', lat: 32.8998, lon: -97.0403 },
  DEN: { name: 'Denver International Airport', city: 'Denver', country: 'US', lat: 39.8561, lon: -104.6737 },
  JFK: { name: 'John F. Kennedy International Airport', city: 'New York', country: 'US', lat: 40.6413, lon: -73.7781 },
  SFO: { name: 'San Francisco International Airport', city: 'San Francisco', country: 'US', lat: 37.6213, lon: -122.3790 },
  SEA: { name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'US', lat: 47.4502, lon: -122.3088 },
  LAS: { name: 'Harry Reid International Airport', city: 'Las Vegas', country: 'US', lat: 36.0840, lon: -115.1537 },
  MCO: { name: 'Orlando International Airport', city: 'Orlando', country: 'US', lat: 28.4312, lon: -81.3081 },
  EWR: { name: 'Newark Liberty International Airport', city: 'Newark', country: 'US', lat: 40.6895, lon: -74.1745 },
  MIA: { name: 'Miami International Airport', city: 'Miami', country: 'US', lat: 25.7959, lon: -80.2870 },
  PHX: { name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', country: 'US', lat: 33.4373, lon: -112.0078 },
  IAH: { name: 'George Bush Intercontinental Airport', city: 'Houston', country: 'US', lat: 29.9902, lon: -95.3368 },
  BOS: { name: 'Boston Logan International Airport', city: 'Boston', country: 'US', lat: 42.3656, lon: -71.0096 },
  MSP: { name: 'Minneapolis-Saint Paul International Airport', city: 'Minneapolis', country: 'US', lat: 44.8820, lon: -93.2218 },
  DTW: { name: 'Detroit Metropolitan Wayne County Airport', city: 'Detroit', country: 'US', lat: 42.2124, lon: -83.3534 },
  PHL: { name: 'Philadelphia International Airport', city: 'Philadelphia', country: 'US', lat: 39.8744, lon: -75.2424 },
  LGA: { name: 'LaGuardia Airport', city: 'New York', country: 'US', lat: 40.7769, lon: -73.8740 },
  FLL: { name: 'Fort Lauderdale-Hollywood International Airport', city: 'Fort Lauderdale', country: 'US', lat: 26.0742, lon: -80.1506 },
  DCA: { name: 'Ronald Reagan Washington National Airport', city: 'Washington', country: 'US', lat: 38.8521, lon: -77.0377 },
  IAD: { name: 'Washington Dulles International Airport', city: 'Washington', country: 'US', lat: 38.9531, lon: -77.4565 },
  BWI: { name: 'Baltimore/Washington International Airport', city: 'Baltimore', country: 'US', lat: 39.1774, lon: -76.6684 },
  SAN: { name: 'San Diego International Airport', city: 'San Diego', country: 'US', lat: 32.7338, lon: -117.1933 },
  TPA: { name: 'Tampa International Airport', city: 'Tampa', country: 'US', lat: 27.9756, lon: -82.5333 },
  PDX: { name: 'Portland International Airport', city: 'Portland', country: 'US', lat: 45.5898, lon: -122.5951 },
  HNL: { name: 'Daniel K. Inouye International Airport', city: 'Honolulu', country: 'US', lat: 21.3187, lon: -157.9225 },
  SLC: { name: 'Salt Lake City International Airport', city: 'Salt Lake City', country: 'US', lat: 40.7884, lon: -111.9778 },
  AUS: { name: 'Austin-Bergstrom International Airport', city: 'Austin', country: 'US', lat: 30.1975, lon: -97.6664 },
  SJC: { name: 'San Jose International Airport', city: 'San Jose', country: 'US', lat: 37.3626, lon: -121.9290 },
  OAK: { name: 'Oakland International Airport', city: 'Oakland', country: 'US', lat: 37.7213, lon: -122.2208 },
  RDU: { name: 'Raleigh-Durham International Airport', city: 'Raleigh', country: 'US', lat: 35.8801, lon: -78.7880 },
  CLT: { name: 'Charlotte Douglas International Airport', city: 'Charlotte', country: 'US', lat: 35.2140, lon: -80.9431 },
  MSY: { name: 'Louis Armstrong New Orleans International Airport', city: 'New Orleans', country: 'US', lat: 29.9934, lon: -90.2580 },
  MDW: { name: 'Chicago Midway International Airport', city: 'Chicago', country: 'US', lat: 41.7868, lon: -87.7522 },
  HOU: { name: 'William P. Hobby Airport', city: 'Houston', country: 'US', lat: 29.6454, lon: -95.2789 },
  STL: { name: 'St. Louis Lambert International Airport', city: 'St. Louis', country: 'US', lat: 38.7487, lon: -90.3700 },
  BNA: { name: 'Nashville International Airport', city: 'Nashville', country: 'US', lat: 36.1263, lon: -86.6774 },
  DAL: { name: 'Dallas Love Field', city: 'Dallas', country: 'US', lat: 32.8471, lon: -96.8518 },
  ANC: { name: 'Ted Stevens Anchorage International Airport', city: 'Anchorage', country: 'US', lat: 61.1743, lon: -149.9962 },

  // North America - Mexico
  MEX: { name: 'Mexico City International Airport', city: 'Mexico City', country: 'MX', lat: 19.4363, lon: -99.0721 },
  CUN: { name: 'Cancun International Airport', city: 'Cancun', country: 'MX', lat: 21.0365, lon: -86.8771 },
  GDL: { name: 'Guadalajara International Airport', city: 'Guadalajara', country: 'MX', lat: 20.5218, lon: -103.3111 },
  SJD: { name: 'Los Cabos International Airport', city: 'San Jose del Cabo', country: 'MX', lat: 23.1518, lon: -109.7215 },
  PVR: { name: 'Puerto Vallarta International Airport', city: 'Puerto Vallarta', country: 'MX', lat: 20.6801, lon: -105.2545 },
  CZM: { name: 'Cozumel International Airport', city: 'Cozumel', country: 'MX', lat: 20.5224, lon: -86.9256 },
  ZIH: { name: 'Ixtapa-Zihuatanejo International Airport', city: 'Zihuatanejo', country: 'MX', lat: 17.6016, lon: -101.4606 },
  HUX: { name: 'Huatulco International Airport', city: 'Huatulco', country: 'MX', lat: 15.7753, lon: -96.2626 },
  MZT: { name: 'Mazatlan International Airport', city: 'Mazatlan', country: 'MX', lat: 23.1614, lon: -106.2661 },
  MTY: { name: 'Monterrey International Airport', city: 'Monterrey', country: 'MX', lat: 25.7785, lon: -100.1069 },
  ACA: { name: 'Acapulco International Airport', city: 'Acapulco', country: 'MX', lat: 16.7571, lon: -99.7540 },

  // Caribbean
  NAS: { name: 'Lynden Pindling International Airport', city: 'Nassau', country: 'BS', lat: 25.0390, lon: -77.4662 },
  MBJ: { name: 'Sangster International Airport', city: 'Montego Bay', country: 'JM', lat: 18.5037, lon: -77.9134 },
  KIN: { name: 'Norman Manley International Airport', city: 'Kingston', country: 'JM', lat: 17.9356, lon: -76.7875 },
  PUJ: { name: 'Punta Cana International Airport', city: 'Punta Cana', country: 'DO', lat: 18.5674, lon: -68.3634 },
  SJU: { name: 'Luis Munoz Marin International Airport', city: 'San Juan', country: 'PR', lat: 18.4394, lon: -66.0018 },
  AUA: { name: 'Queen Beatrix International Airport', city: 'Oranjestad', country: 'AW', lat: 12.5014, lon: -70.0152 },
  BGI: { name: 'Grantley Adams International Airport', city: 'Bridgetown', country: 'BB', lat: 13.0746, lon: -59.4925 },
  POS: { name: 'Piarco International Airport', city: 'Port of Spain', country: 'TT', lat: 10.5954, lon: -61.3372 },
  CUR: { name: 'Curacao International Airport', city: 'Willemstad', country: 'CW', lat: 12.1889, lon: -68.9598 },
  SXM: { name: 'Princess Juliana International Airport', city: 'Philipsburg', country: 'SX', lat: 18.0410, lon: -63.1089 },
  // Cuba
  VRA: { name: 'Juan Gualberto Gomez International Airport', city: 'Varadero', country: 'CU', lat: 23.0344, lon: -81.4353 },
  HAV: { name: 'Jose Marti International Airport', city: 'Havana', country: 'CU', lat: 22.9892, lon: -82.4091 },
  HOG: { name: 'Frank Pais International Airport', city: 'Holguin', country: 'CU', lat: 20.7856, lon: -76.3151 },
  SNU: { name: 'Abel Santamaria Airport', city: 'Santa Clara', country: 'CU', lat: 22.4922, lon: -79.9436 },
  CCC: { name: 'Jardines del Rey Airport', city: 'Cayo Coco', country: 'CU', lat: 22.4610, lon: -78.3296 },
  CMW: { name: 'Ignacio Agramonte International Airport', city: 'Camaguey', country: 'CU', lat: 21.4203, lon: -77.8475 },
  SCU: { name: 'Antonio Maceo International Airport', city: 'Santiago de Cuba', country: 'CU', lat: 19.9698, lon: -75.8354 },
  CYO: { name: 'Cayo Largo del Sur Airport', city: 'Cayo Largo', country: 'CU', lat: 21.6165, lon: -81.5460 },

  // Europe - United Kingdom
  LHR: { name: 'Heathrow Airport', city: 'London', country: 'GB', lat: 51.4700, lon: -0.4543 },
  LGW: { name: 'Gatwick Airport', city: 'London', country: 'GB', lat: 51.1537, lon: -0.1821 },
  MAN: { name: 'Manchester Airport', city: 'Manchester', country: 'GB', lat: 53.3537, lon: -2.2750 },
  STN: { name: 'London Stansted Airport', city: 'London', country: 'GB', lat: 51.8860, lon: 0.2389 },
  LTN: { name: 'London Luton Airport', city: 'London', country: 'GB', lat: 51.8747, lon: -0.3683 },
  EDI: { name: 'Edinburgh Airport', city: 'Edinburgh', country: 'GB', lat: 55.9500, lon: -3.3725 },
  BHX: { name: 'Birmingham Airport', city: 'Birmingham', country: 'GB', lat: 52.4539, lon: -1.7480 },
  GLA: { name: 'Glasgow Airport', city: 'Glasgow', country: 'GB', lat: 55.8719, lon: -4.4331 },
  BRS: { name: 'Bristol Airport', city: 'Bristol', country: 'GB', lat: 51.3827, lon: -2.7190 },
  NCL: { name: 'Newcastle Airport', city: 'Newcastle', country: 'GB', lat: 55.0375, lon: -1.6917 },
  LCY: { name: 'London City Airport', city: 'London', country: 'GB', lat: 51.5053, lon: 0.0553 },

  // Europe - France
  CDG: { name: 'Charles de Gaulle Airport', city: 'Paris', country: 'FR', lat: 49.0097, lon: 2.5479 },
  ORY: { name: 'Paris Orly Airport', city: 'Paris', country: 'FR', lat: 48.7262, lon: 2.3652 },
  NCE: { name: 'Nice Cote d\'Azur Airport', city: 'Nice', country: 'FR', lat: 43.6584, lon: 7.2159 },
  LYS: { name: 'Lyon Saint-Exupery Airport', city: 'Lyon', country: 'FR', lat: 45.7256, lon: 5.0811 },
  MRS: { name: 'Marseille Provence Airport', city: 'Marseille', country: 'FR', lat: 43.4393, lon: 5.2214 },
  TLS: { name: 'Toulouse-Blagnac Airport', city: 'Toulouse', country: 'FR', lat: 43.6291, lon: 1.3638 },
  BOD: { name: 'Bordeaux-Merignac Airport', city: 'Bordeaux', country: 'FR', lat: 44.8283, lon: -0.7156 },

  // Europe - Germany
  FRA: { name: 'Frankfurt Airport', city: 'Frankfurt', country: 'DE', lat: 50.0379, lon: 8.5622 },
  MUC: { name: 'Munich Airport', city: 'Munich', country: 'DE', lat: 48.3537, lon: 11.7750 },
  BER: { name: 'Berlin Brandenburg Airport', city: 'Berlin', country: 'DE', lat: 52.3667, lon: 13.5033 },
  DUS: { name: 'Dusseldorf Airport', city: 'Dusseldorf', country: 'DE', lat: 51.2895, lon: 6.7668 },
  HAM: { name: 'Hamburg Airport', city: 'Hamburg', country: 'DE', lat: 53.6304, lon: 10.0063 },
  STR: { name: 'Stuttgart Airport', city: 'Stuttgart', country: 'DE', lat: 48.6899, lon: 9.2220 },
  CGN: { name: 'Cologne Bonn Airport', city: 'Cologne', country: 'DE', lat: 50.8659, lon: 7.1427 },

  // Europe - Netherlands
  AMS: { name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'NL', lat: 52.3105, lon: 4.7683 },

  // Europe - Belgium
  BRU: { name: 'Brussels Airport', city: 'Brussels', country: 'BE', lat: 50.9014, lon: 4.4844 },

  // Europe - Switzerland
  ZRH: { name: 'Zurich Airport', city: 'Zurich', country: 'CH', lat: 47.4647, lon: 8.5492 },
  GVA: { name: 'Geneva Airport', city: 'Geneva', country: 'CH', lat: 46.2370, lon: 6.1092 },

  // Europe - Austria
  VIE: { name: 'Vienna International Airport', city: 'Vienna', country: 'AT', lat: 48.1103, lon: 16.5697 },

  // Europe - Italy
  FCO: { name: 'Leonardo da Vinci-Fiumicino Airport', city: 'Rome', country: 'IT', lat: 41.8003, lon: 12.2389 },
  MXP: { name: 'Milan Malpensa Airport', city: 'Milan', country: 'IT', lat: 45.6306, lon: 8.7281 },
  VCE: { name: 'Venice Marco Polo Airport', city: 'Venice', country: 'IT', lat: 45.5053, lon: 12.3519 },
  NAP: { name: 'Naples International Airport', city: 'Naples', country: 'IT', lat: 40.8860, lon: 14.2908 },
  FLR: { name: 'Florence Airport', city: 'Florence', country: 'IT', lat: 43.8100, lon: 11.2051 },
  LIN: { name: 'Milan Linate Airport', city: 'Milan', country: 'IT', lat: 45.4494, lon: 9.2783 },
  BGY: { name: 'Milan Bergamo Airport', city: 'Milan', country: 'IT', lat: 45.6739, lon: 9.7042 },

  // Europe - Spain
  MAD: { name: 'Adolfo Suarez Madrid-Barajas Airport', city: 'Madrid', country: 'ES', lat: 40.4983, lon: -3.5676 },
  BCN: { name: 'Barcelona-El Prat Airport', city: 'Barcelona', country: 'ES', lat: 41.2971, lon: 2.0785 },
  PMI: { name: 'Palma de Mallorca Airport', city: 'Palma', country: 'ES', lat: 39.5517, lon: 2.7388 },
  AGP: { name: 'Malaga-Costa del Sol Airport', city: 'Malaga', country: 'ES', lat: 36.6749, lon: -4.4991 },
  ALC: { name: 'Alicante-Elche Airport', city: 'Alicante', country: 'ES', lat: 38.2822, lon: -0.5582 },
  TFS: { name: 'Tenerife South Airport', city: 'Tenerife', country: 'ES', lat: 28.0445, lon: -16.5725 },
  IBZ: { name: 'Ibiza Airport', city: 'Ibiza', country: 'ES', lat: 38.8729, lon: 1.3731 },
  LPA: { name: 'Gran Canaria Airport', city: 'Las Palmas', country: 'ES', lat: 27.9319, lon: -15.3866 },

  // Europe - Portugal
  LIS: { name: 'Lisbon Airport', city: 'Lisbon', country: 'PT', lat: 38.7813, lon: -9.1359 },
  OPO: { name: 'Porto Airport', city: 'Porto', country: 'PT', lat: 41.2481, lon: -8.6814 },
  FAO: { name: 'Faro Airport', city: 'Faro', country: 'PT', lat: 37.0144, lon: -7.9659 },

  // Europe - Ireland
  DUB: { name: 'Dublin Airport', city: 'Dublin', country: 'IE', lat: 53.4264, lon: -6.2499 },
  SNN: { name: 'Shannon Airport', city: 'Shannon', country: 'IE', lat: 52.7020, lon: -8.9248 },
  ORK: { name: 'Cork Airport', city: 'Cork', country: 'IE', lat: 51.8413, lon: -8.4911 },

  // Europe - Nordic Countries
  CPH: { name: 'Copenhagen Airport', city: 'Copenhagen', country: 'DK', lat: 55.6180, lon: 12.6560 },
  ARN: { name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'SE', lat: 59.6519, lon: 17.9186 },
  OSL: { name: 'Oslo Gardermoen Airport', city: 'Oslo', country: 'NO', lat: 60.1976, lon: 11.1004 },
  HEL: { name: 'Helsinki-Vantaa Airport', city: 'Helsinki', country: 'FI', lat: 60.3172, lon: 24.9633 },
  KEF: { name: 'Keflavik International Airport', city: 'Reykjavik', country: 'IS', lat: 63.9850, lon: -22.6056 },

  // Europe - Greece
  ATH: { name: 'Athens International Airport', city: 'Athens', country: 'GR', lat: 37.9364, lon: 23.9445 },
  SKG: { name: 'Thessaloniki Airport', city: 'Thessaloniki', country: 'GR', lat: 40.5197, lon: 22.9709 },
  HER: { name: 'Heraklion International Airport', city: 'Heraklion', country: 'GR', lat: 35.3397, lon: 25.1803 },
  RHO: { name: 'Rhodes International Airport', city: 'Rhodes', country: 'GR', lat: 36.4054, lon: 28.0862 },
  JTR: { name: 'Santorini Airport', city: 'Santorini', country: 'GR', lat: 36.3992, lon: 25.4793 },
  MJT: { name: 'Mytilene International Airport', city: 'Lesbos', country: 'GR', lat: 39.0567, lon: 26.5983 },

  // Europe - Turkey
  IST: { name: 'Istanbul Airport', city: 'Istanbul', country: 'TR', lat: 41.2608, lon: 28.7418 },
  SAW: { name: 'Istanbul Sabiha Gokcen Airport', city: 'Istanbul', country: 'TR', lat: 40.8986, lon: 29.3092 },
  AYT: { name: 'Antalya Airport', city: 'Antalya', country: 'TR', lat: 36.8987, lon: 30.8005 },
  ADB: { name: 'Izmir Adnan Menderes Airport', city: 'Izmir', country: 'TR', lat: 38.2924, lon: 27.1570 },

  // Europe - Eastern Europe
  PRG: { name: 'Vaclav Havel Airport Prague', city: 'Prague', country: 'CZ', lat: 50.1008, lon: 14.2600 },
  WAW: { name: 'Warsaw Chopin Airport', city: 'Warsaw', country: 'PL', lat: 52.1657, lon: 20.9671 },
  BUD: { name: 'Budapest Ferenc Liszt International Airport', city: 'Budapest', country: 'HU', lat: 47.4298, lon: 19.2611 },
  OTP: { name: 'Henri Coanda International Airport', city: 'Bucharest', country: 'RO', lat: 44.5711, lon: 26.0858 },
  SOF: { name: 'Sofia Airport', city: 'Sofia', country: 'BG', lat: 42.6952, lon: 23.4062 },

  // Middle East
  DXB: { name: 'Dubai International Airport', city: 'Dubai', country: 'AE', lat: 25.2532, lon: 55.3657 },
  AUH: { name: 'Abu Dhabi International Airport', city: 'Abu Dhabi', country: 'AE', lat: 24.4330, lon: 54.6511 },
  DOH: { name: 'Hamad International Airport', city: 'Doha', country: 'QA', lat: 25.2731, lon: 51.6081 },
  TLV: { name: 'Ben Gurion Airport', city: 'Tel Aviv', country: 'IL', lat: 32.0055, lon: 34.8854 },
  AMM: { name: 'Queen Alia International Airport', city: 'Amman', country: 'JO', lat: 31.7226, lon: 35.9932 },
  CAI: { name: 'Cairo International Airport', city: 'Cairo', country: 'EG', lat: 30.1219, lon: 31.4056 },
  RUH: { name: 'King Khalid International Airport', city: 'Riyadh', country: 'SA', lat: 24.9578, lon: 46.6989 },
  JED: { name: 'King Abdulaziz International Airport', city: 'Jeddah', country: 'SA', lat: 21.6796, lon: 39.1565 },
  KWI: { name: 'Kuwait International Airport', city: 'Kuwait City', country: 'KW', lat: 29.2266, lon: 47.9689 },
  BAH: { name: 'Bahrain International Airport', city: 'Manama', country: 'BH', lat: 26.2708, lon: 50.6336 },
  MCT: { name: 'Muscat International Airport', city: 'Muscat', country: 'OM', lat: 23.5933, lon: 58.2844 },

  // Asia - East Asia
  HND: { name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'JP', lat: 35.5494, lon: 139.7798 },
  NRT: { name: 'Narita International Airport', city: 'Tokyo', country: 'JP', lat: 35.7720, lon: 140.3929 },
  KIX: { name: 'Kansai International Airport', city: 'Osaka', country: 'JP', lat: 34.4347, lon: 135.2441 },
  PEK: { name: 'Beijing Capital International Airport', city: 'Beijing', country: 'CN', lat: 40.0799, lon: 116.6031 },
  PKX: { name: 'Beijing Daxing International Airport', city: 'Beijing', country: 'CN', lat: 39.5098, lon: 116.4105 },
  PVG: { name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'CN', lat: 31.1443, lon: 121.8083 },
  SHA: { name: 'Shanghai Hongqiao International Airport', city: 'Shanghai', country: 'CN', lat: 31.1979, lon: 121.3363 },
  CAN: { name: 'Guangzhou Baiyun International Airport', city: 'Guangzhou', country: 'CN', lat: 23.3959, lon: 113.3080 },
  HKG: { name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'HK', lat: 22.3080, lon: 113.9185 },
  ICN: { name: 'Incheon International Airport', city: 'Seoul', country: 'KR', lat: 37.4602, lon: 126.4407 },
  GMP: { name: 'Gimpo International Airport', city: 'Seoul', country: 'KR', lat: 37.5583, lon: 126.7906 },
  TPE: { name: 'Taiwan Taoyuan International Airport', city: 'Taipei', country: 'TW', lat: 25.0797, lon: 121.2342 },

  // Asia - Southeast Asia
  SIN: { name: 'Singapore Changi Airport', city: 'Singapore', country: 'SG', lat: 1.3644, lon: 103.9915 },
  BKK: { name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'TH', lat: 13.6900, lon: 100.7501 },
  KUL: { name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'MY', lat: 2.7456, lon: 101.7099 },
  CGK: { name: 'Soekarno-Hatta International Airport', city: 'Jakarta', country: 'ID', lat: -6.1256, lon: 106.6558 },
  DPS: { name: 'Ngurah Rai International Airport', city: 'Bali', country: 'ID', lat: -8.7482, lon: 115.1672 },
  MNL: { name: 'Ninoy Aquino International Airport', city: 'Manila', country: 'PH', lat: 14.5086, lon: 121.0194 },
  SGN: { name: 'Tan Son Nhat International Airport', city: 'Ho Chi Minh City', country: 'VN', lat: 10.8188, lon: 106.6520 },
  HAN: { name: 'Noi Bai International Airport', city: 'Hanoi', country: 'VN', lat: 21.2187, lon: 105.8071 },
  REP: { name: 'Siem Reap International Airport', city: 'Siem Reap', country: 'KH', lat: 13.4107, lon: 103.8128 },
  PNH: { name: 'Phnom Penh International Airport', city: 'Phnom Penh', country: 'KH', lat: 11.5466, lon: 104.8441 },
  RGN: { name: 'Yangon International Airport', city: 'Yangon', country: 'MM', lat: 16.9073, lon: 96.1332 },

  // Asia - South Asia
  DEL: { name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'IN', lat: 28.5562, lon: 77.1000 },
  BOM: { name: 'Chhatrapati Shivaji International Airport', city: 'Mumbai', country: 'IN', lat: 19.0896, lon: 72.8656 },
  BLR: { name: 'Kempegowda International Airport', city: 'Bangalore', country: 'IN', lat: 13.1986, lon: 77.7066 },
  MAA: { name: 'Chennai International Airport', city: 'Chennai', country: 'IN', lat: 12.9941, lon: 80.1709 },
  HYD: { name: 'Rajiv Gandhi International Airport', city: 'Hyderabad', country: 'IN', lat: 17.2403, lon: 78.4294 },
  CCU: { name: 'Netaji Subhas Chandra Bose International Airport', city: 'Kolkata', country: 'IN', lat: 22.6520, lon: 88.4463 },
  CMB: { name: 'Bandaranaike International Airport', city: 'Colombo', country: 'LK', lat: 7.1808, lon: 79.8841 },
  MLE: { name: 'Velana International Airport', city: 'Male', country: 'MV', lat: 4.1918, lon: 73.5290 },
  DAC: { name: 'Hazrat Shahjalal International Airport', city: 'Dhaka', country: 'BD', lat: 23.8433, lon: 90.3978 },
  KTM: { name: 'Tribhuvan International Airport', city: 'Kathmandu', country: 'NP', lat: 27.6966, lon: 85.3591 },

  // Oceania
  SYD: { name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'AU', lat: -33.9461, lon: 151.1772 },
  MEL: { name: 'Melbourne Airport', city: 'Melbourne', country: 'AU', lat: -37.6733, lon: 144.8433 },
  BNE: { name: 'Brisbane Airport', city: 'Brisbane', country: 'AU', lat: -27.3842, lon: 153.1175 },
  PER: { name: 'Perth Airport', city: 'Perth', country: 'AU', lat: -31.9403, lon: 115.9669 },
  AKL: { name: 'Auckland Airport', city: 'Auckland', country: 'NZ', lat: -37.0082, lon: 174.7850 },
  WLG: { name: 'Wellington Airport', city: 'Wellington', country: 'NZ', lat: -41.3272, lon: 174.8053 },
  CHC: { name: 'Christchurch Airport', city: 'Christchurch', country: 'NZ', lat: -43.4894, lon: 172.5322 },
  ZQN: { name: 'Queenstown Airport', city: 'Queenstown', country: 'NZ', lat: -45.0210, lon: 168.7392 },
  NAN: { name: 'Nadi International Airport', city: 'Nadi', country: 'FJ', lat: -17.7553, lon: 177.4431 },
  PPT: { name: 'Tahiti Faa\'a International Airport', city: 'Papeete', country: 'PF', lat: -17.5537, lon: -149.6073 },

  // Africa
  JNB: { name: 'O.R. Tambo International Airport', city: 'Johannesburg', country: 'ZA', lat: -26.1392, lon: 28.2460 },
  CPT: { name: 'Cape Town International Airport', city: 'Cape Town', country: 'ZA', lat: -33.9715, lon: 18.6021 },
  NBO: { name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country: 'KE', lat: -1.3192, lon: 36.9278 },
  ADD: { name: 'Bole International Airport', city: 'Addis Ababa', country: 'ET', lat: 8.9779, lon: 38.7993 },
  CMN: { name: 'Mohammed V International Airport', city: 'Casablanca', country: 'MA', lat: 33.3675, lon: -7.5898 },
  RAK: { name: 'Marrakech Menara Airport', city: 'Marrakech', country: 'MA', lat: 31.6069, lon: -8.0363 },
  TUN: { name: 'Tunis-Carthage International Airport', city: 'Tunis', country: 'TN', lat: 36.8510, lon: 10.2272 },
  ALG: { name: 'Houari Boumediene Airport', city: 'Algiers', country: 'DZ', lat: 36.6910, lon: 3.2155 },
  LOS: { name: 'Murtala Muhammed International Airport', city: 'Lagos', country: 'NG', lat: 6.5774, lon: 3.3212 },
  ACC: { name: 'Kotoka International Airport', city: 'Accra', country: 'GH', lat: 5.6052, lon: -0.1668 },
  DAR: { name: 'Julius Nyerere International Airport', city: 'Dar es Salaam', country: 'TZ', lat: -6.8781, lon: 39.2026 },
  ZNZ: { name: 'Abeid Amani Karume International Airport', city: 'Zanzibar', country: 'TZ', lat: -6.2220, lon: 39.2249 },
  MRU: { name: 'Sir Seewoosagur Ramgoolam International Airport', city: 'Mauritius', country: 'MU', lat: -20.4302, lon: 57.6836 },
  SEZ: { name: 'Seychelles International Airport', city: 'Mahe', country: 'SC', lat: -4.6743, lon: 55.5218 },

  // South America
  GRU: { name: 'Sao Paulo-Guarulhos International Airport', city: 'Sao Paulo', country: 'BR', lat: -23.4356, lon: -46.4731 },
  GIG: { name: 'Rio de Janeiro-Galeao International Airport', city: 'Rio de Janeiro', country: 'BR', lat: -22.8100, lon: -43.2506 },
  EZE: { name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', country: 'AR', lat: -34.8222, lon: -58.5358 },
  AEP: { name: 'Aeroparque Jorge Newbery', city: 'Buenos Aires', country: 'AR', lat: -34.5592, lon: -58.4156 },
  SCL: { name: 'Arturo Merino Benitez International Airport', city: 'Santiago', country: 'CL', lat: -33.3930, lon: -70.7858 },
  LIM: { name: 'Jorge Chavez International Airport', city: 'Lima', country: 'PE', lat: -12.0219, lon: -77.1143 },
  BOG: { name: 'El Dorado International Airport', city: 'Bogota', country: 'CO', lat: 4.7016, lon: -74.1469 },
  CTG: { name: 'Rafael Nunez International Airport', city: 'Cartagena', country: 'CO', lat: 10.4424, lon: -75.5130 },
  UIO: { name: 'Mariscal Sucre International Airport', city: 'Quito', country: 'EC', lat: -0.1292, lon: -78.3575 },
  CCS: { name: 'Simon Bolivar International Airport', city: 'Caracas', country: 'VE', lat: 10.6012, lon: -66.9913 },
  MVD: { name: 'Carrasco International Airport', city: 'Montevideo', country: 'UY', lat: -34.8384, lon: -56.0308 },
  ASU: { name: 'Silvio Pettirossi International Airport', city: 'Asuncion', country: 'PY', lat: -25.2400, lon: -57.5191 },
  LPB: { name: 'El Alto International Airport', city: 'La Paz', country: 'BO', lat: -16.5133, lon: -68.1923 },
}

/**
 * Get the number of airports in the database
 */
export function getAirportCount(): number {
  return Object.keys(AIRPORTS).length
}
