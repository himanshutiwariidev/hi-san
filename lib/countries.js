// Shared by the server (lead parsing) and the UI (filters, flags).
export const countries = [
  { code: "in", name: "India" },
  { code: "us", name: "United States" },
  { code: "gb", name: "United Kingdom" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "sa", name: "Saudi Arabia" },
  { code: "qa", name: "Qatar" },
  { code: "kw", name: "Kuwait" },
  { code: "om", name: "Oman" },
  { code: "bh", name: "Bahrain" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "it", name: "Italy" },
  { code: "es", name: "Spain" },
  { code: "nl", name: "Netherlands" },
  { code: "be", name: "Belgium" },
  { code: "ca", name: "Canada" },
  { code: "au", name: "Australia" },
  { code: "nz", name: "New Zealand" },
  { code: "sg", name: "Singapore" },
  { code: "my", name: "Malaysia" },
  { code: "id", name: "Indonesia" },
  { code: "th", name: "Thailand" },
  { code: "vn", name: "Vietnam" },
  { code: "ph", name: "Philippines" },
  { code: "jp", name: "Japan" },
  { code: "kr", name: "South Korea" },
  { code: "cn", name: "China" },
  { code: "hk", name: "Hong Kong" },
  { code: "bd", name: "Bangladesh" },
  { code: "np", name: "Nepal" },
  { code: "lk", name: "Sri Lanka" },
  { code: "pk", name: "Pakistan" },
  { code: "za", name: "South Africa" },
  { code: "ng", name: "Nigeria" },
  { code: "ke", name: "Kenya" },
  { code: "eg", name: "Egypt" },
  { code: "tr", name: "Turkey" },
  { code: "ru", name: "Russia" },
  { code: "br", name: "Brazil" },
  { code: "mx", name: "Mexico" },
];

const byName = new Map(countries.map((c) => [c.name.toLowerCase(), c]));
const aliases = { usa: "us", "u.s.a": "us", uk: "gb", uae: "ae", "united states of america": "us", "u.a.e": "ae", "great britain": "gb" };

export function findCountry(text) {
  if (!text) return null;
  const key = String(text).trim().toLowerCase();
  if (byName.has(key)) return byName.get(key);
  if (aliases[key]) return countries.find((c) => c.code === aliases[key]);
  return countries.find((c) => c.code === key) ?? null;
}

const normalizeName = (text) =>
  String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Names IndiaMART uses that differ from the standard region names.
const FLAG_NAME_ALIASES = {
  usa: "us", "u s a": "us", america: "us", "united states of america": "us",
  uk: "gb", "u k": "gb", britain: "gb", "great britain": "gb", england: "gb", scotland: "gb", wales: "gb",
  uae: "ae", "u a e": "ae", emirates: "ae",
  turkey: "tr", korea: "kr", "czech republic": "cz", "ivory coast": "ci", "cote d ivoire": "ci", burma: "mm",
  "democratic republic of the congo": "cd", "republic of the congo": "cg", "hong kong": "hk", vatican: "va",
};

let regionsByName = null;
let regionCodes = null;
function regions() {
  if (regionsByName) return regionsByName;
  const byRegionName = new Map();
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (let first = 97; first <= 122; first += 1) {
      for (let second = 97; second <= 122; second += 1) {
        const code = String.fromCharCode(first, second);
        const name = names.of(code.toUpperCase());
        if (name && name.toLowerCase() !== code && code !== "zz") byRegionName.set(normalizeName(name), code);
      }
    }
  } catch {
    // Intl without region data: the aliases and the list above still work.
  }
  for (const country of countries) byRegionName.set(normalizeName(country.name), country.code);
  for (const [name, code] of Object.entries(FLAG_NAME_ALIASES)) byRegionName.set(name, code);
  regionsByName = byRegionName;
  regionCodes = new Set(byRegionName.values());
  return byRegionName;
}

// The lowercase code flagcdn.com serves a flag under, or "" when the country is not certain.
// IndiaMART sends uppercase codes and "UK" for Britain; flagcdn only has lowercase codes and "gb".
export function flagCode(code, name) {
  const raw = String(code ?? "").trim().toLowerCase();
  const candidate = raw === "uk" ? "gb" : raw;
  const byName = regions();
  if (/^[a-z]{2}$/.test(candidate) && regionCodes.has(candidate)) return candidate;
  return byName.get(normalizeName(name)) ?? "";
}

export function countryName(code) {
  return countries.find((c) => c.code === code)?.name ?? code?.toUpperCase() ?? "Unknown";
}
