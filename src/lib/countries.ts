import type { Language } from "../i18n";

export interface CountryOption {
  code: string;
  flag: string;
  name: string;
  searchText: string;
}

const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AT", "AU", "AW", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BN", "BO", "BR", "BS", "BT", "BW", "BY", "BZ",
  "CA", "CD", "CF", "CG", "CH", "CI", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "ER", "ES", "ET",
  "FI", "FJ", "FM", "FR",
  "GA", "GB", "GD", "GE", "GH", "GM", "GN", "GQ", "GR", "GT", "GW", "GY",
  "HK", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IN", "IQ", "IR", "IS", "IT",
  "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MR", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NE", "NG", "NI", "NL", "NO", "NP", "NR", "NZ",
  "OM",
  "PA", "PE", "PG", "PH", "PK", "PL", "PS", "PT", "PW", "PY",
  "QA",
  "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SY", "SZ",
  "TD", "TG", "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "US", "UY", "UZ",
  "VA", "VC", "VE", "VN", "VU",
  "WS",
  "YE",
  "ZA", "ZM", "ZW",
] as const;

const localeByLanguage: Record<Language, string> = {
  en: "en",
  ja: "ja",
};

const optionsCache = new Map<Language, CountryOption[]>();

function createDisplayNames(language: Language) {
  try {
    return new Intl.DisplayNames([localeByLanguage[language], "en"], { type: "region" });
  } catch {
    return null;
  }
}

export function getCountryFlag(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return "";
  }
  return String.fromCodePoint(...normalized.split("").map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

export function getCountryName(code: string, language: Language) {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return normalized;
  }
  return createDisplayNames(language)?.of(normalized) ?? normalized;
}

export function getCountryOptions(language: Language) {
  const cached = optionsCache.get(language);
  if (cached) {
    return cached;
  }

  const options = COUNTRY_CODES.map((code) => {
    const name = getCountryName(code, language);
    return {
      code,
      flag: getCountryFlag(code),
      name,
      searchText: `${code} ${name}`.toLowerCase(),
    } satisfies CountryOption;
  }).sort((left, right) => left.name.localeCompare(right.name));

  optionsCache.set(language, options);
  return options;
}

export function findCountryOption(code: string, language: Language) {
  const normalized = code.trim().toUpperCase();
  return getCountryOptions(language).find((option) => option.code === normalized) ?? null;
}

export function formatCountryAnswerText(code: string, language: Language) {
  const country = findCountryOption(code, language);
  return country ? `${country.flag} ${country.name}` : code.trim().toUpperCase();
}
