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

export function countryName(code) {
  return countries.find((c) => c.code === code)?.name ?? code?.toUpperCase() ?? "Unknown";
}
