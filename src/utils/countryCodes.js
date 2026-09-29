// Shared ISO 3166-1 alpha-2 normalisation.
// ISO alpha-2 is the required general-purpose country-code format.
// The code set below contains the current ISO 3166-1 alpha-2 entries; names are
// resolved by the runtime's English Intl data so extraction/validation share one source.
const ISO2_CODES=`
AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW SH BL KN LC PM MF VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW
`.trim().split(/\\s+/);

const displayNames = typeof Intl !== "undefined" && Intl.DisplayNames
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

const ISO2_TO_NAME = Object.fromEntries(
  ISO2_CODES.map(code => [code, displayNames?.of(code) || code])
);

const normalizeKey = value =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toUpperCase()
    .replace(/[’'.,()]/g, " ")
    .replace(/[-/]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();

const COUNTRY_NAME_TO_ISO2 = Object.fromEntries(
  ISO2_CODES.flatMap(code => {
    const name = ISO2_TO_NAME[code];
    return name ? [[normalizeKey(name), code]] : [];
  })
);

// Common customs-document names and regional shorthand which are not themselves
// ISO country names but unambiguously refer to an ISO country code.
const COUNTRY_ALIASES = {
  "UNITED KINGDOM": "GB",
  "UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND": "GB",
  "UK": "GB",
  "GREAT BRITAIN": "GB",
  "BRITAIN": "GB",
  "ENGLAND": "GB",
  "SCOTLAND": "GB",
  "WALES": "GB",
  "NORTHERN IRELAND": "GB",
  "CZECH REPUBLIC": "CZ",
  "SOUTH KOREA": "KR",
  "NORTH KOREA": "KP",
  "KOREA SOUTH": "KR",
  "KOREA NORTH": "KP",
  "RUSSIA": "RU",
  "TURKEY": "TR",
  "VIETNAM": "VN",
  "IVORY COAST": "CI",
  "BOLIVIA": "BO",
  "IRAN": "IR",
  "LAOS": "LA",
  "MOLDOVA": "MD",
  "TANZANIA": "TZ",
  "VENEZUELA": "VE",
  "SYRIA": "SY",
  "TAIWAN": "TW",
  "PALESTINE": "PS",
  "NETHERLANDS": "NL",
  "UNITED STATES": "US",
  "USA": "US",
  "UAE": "AE",
  "CAPE VERDE": "CV",
  "SWAZILAND": "SZ",
  "BURMA": "MM"
};

export function normalizeCountryCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const upper = raw.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(ISO2_TO_NAME, upper)) return upper;

  const key = normalizeKey(raw);
  if (Object.prototype.hasOwnProperty.call(COUNTRY_ALIASES, key)) {
    return COUNTRY_ALIASES[key];
  }

  if (Object.prototype.hasOwnProperty.call(COUNTRY_NAME_TO_ISO2, key)) {
    return COUNTRY_NAME_TO_ISO2[key];
  }

  // Leave unknown values unchanged so validation can flag them rather than
  // silently inventing a country code.
  return upper;
}
