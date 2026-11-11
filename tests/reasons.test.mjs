// The pure vocabulary and flag rules.
import assert from "node:assert/strict";
import { test } from "node:test";
import { countries, flagCode, findCountry } from "../lib/countries.js";
import { describeLeadReason } from "../lib/leadReasons.js";

test("flags: IndiaMART's forms map to the codes flagcdn serves", () => {
  const cases = [["US", "USA", "us"], ["us", null, "us"], ["UK", "UK", "gb"], ["uk", null, "gb"], ["GB", null, "gb"], ["IN", "India", "in"], [" ae ", null, "ae"]];
  for (const [code, name, expected] of cases) assert.equal(flagCode(code, name), expected, `${code}/${name}`);
});

test("flags: a missing code falls back to an exact country name", () => {
  const cases = [["USA", "us"], ["United States of America", "us"], ["U.K.", "gb"], ["UK", "gb"], ["Great Britain", "gb"], ["UAE", "ae"], ["United Arab Emirates", "ae"], ["South Korea", "kr"], ["Turkey", "tr"], ["Türkiye", "tr"], ["Côte d’Ivoire", "ci"], ["Ivory Coast", "ci"], ["Czech Republic", "cz"], ["Lithuania", "lt"], ["Uruguay", "uy"], ["ireland", "ie"], ["  Finland  ", "fi"]];
  for (const [name, expected] of cases) assert.equal(flagCode("", name), expected, name);
});

test("flags: uncertain input shows no flag rather than a wrong one", () => {
  const cases = [[null, null], ["", ""], ["??", "Atlantis"], ["XX", null], ["ZZ", null], ["USA", null], ["1", null], ["", "Austin, Texas, USA"], ["", "Unknown"], ["", "U"]];
  for (const [code, name] of cases) assert.equal(flagCode(code, name), "", `${code}/${name}`);
});

test("flags: every country in the app's list has a flag", () => {
  for (const country of countries) assert.equal(flagCode(country.code, country.name), country.code);
});

test("the existing country lookup is unchanged", () => {
  assert.equal(findCountry("UK").code, "gb");
  assert.equal(findCountry("USA").code, "us");
  assert.equal(findCountry("Atlantis"), null);
});

test("reasons: every status has one", () => {
  assert.equal(describeLeadReason({ status: "retrieved", filter_reason: "Filtered by rules" }).label, "Successfully retrieved");
  assert.equal(describeLeadReason({ status: "pending" }).label, "Pending");
  assert.equal(describeLeadReason({ status: "filtered", filter_reason: "Filtered by rules" }).code, "reason_not_recorded");
  assert.equal(describeLeadReason({ status: "not_retrieved", filter_reason: "not_retrieved" }).label, "Retrieval Failed");
});

test("reasons: a corrupt explanation is ignored", () => {
  const reason = describeLeadReason({ status: "filtered", filter_reason: "contact_requirement_not_met", reason_detail: "{broken" });
  assert.equal(reason.label, "Contact Mismatch");
  assert.deepEqual(reason.also, []);
});

test("reasons: duplicate labels are not repeated", () => {
  const reason = describeLeadReason({
    status: "filtered",
    filter_reason: "country_not_allowed",
    reason_detail: JSON.stringify({ reasons: ["country_not_allowed", "keyword_country_mismatch", "unknown_code"] }),
  });
  assert.deepEqual(reason.also, []);
});

test("reasons: the report's categories all exist", () => {
  const labels = [
    "country_not_allowed", "no_positive_keyword_match", "contact_requirement_not_met", "invalid_title",
    "bought_no_details:x", "buy_failed:HTTP 500", "buy_failed:bridge_timeout",
  ].map((filter_reason) => describeLeadReason({ status: "not_retrieved", filter_reason }).label);
  assert.deepEqual(labels, ["Country Mismatch", "Keyword Mismatch", "Contact Mismatch", "Incomplete Lead Data", "Missing Contact Information", "Retrieval Failed", "Retrieval Timeout"]);
});
