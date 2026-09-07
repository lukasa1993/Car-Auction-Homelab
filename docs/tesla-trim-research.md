# Resolving Tesla retail trims

Investigated on 2026-09-07. The offline decoder now uses the model-year catalog
to produce a best-effort final trim. Photo recognition and owner-authorized API
enrichment are not implemented.

## Implemented behavior

`public/tesla-trim-catalog.js` contains normalized EPA/DOE US candidates for
2015–2026. The [raw responses](tesla-epa-models.json) preserve the retrieved
2012–2026 model names and source URLs. Wheel-size variants and EPA -I/-E
suffixes are collapsed. Unnamed S/X records and early battery-capacity groups
do not establish retail badges and are omitted from the candidate table.

`public/tesla-trims.js` adds a structured `trim` result to the page's decoded
VIN: `label`, `vehicleLabel`, `status`, `candidates`, `reason` and `source`.
The final section in `public/vin.html` displays that result. Status is one of
`inferred`, `ambiguous`, `configuration` or `unknown`; a VIN-based result is
never described as vehicle-specific confirmation.

- One model/year/motor candidate becomes an estimated trim, such as a US 2018 Model S performance dual motor -> P100D.
- Short numeric badge alternatives appear in the final title, such as P90D / P100D. Longer lists remain in the explanation with a drivetrain label as the title.
- P2 dual-motor S/X retain Dual Motor AWD because their retail range tier is unresolved. P2 tri-motor S/X infer Plaid for 2021–2026, independently of legacy catalog records.
- US catalog estimates require a US manufacturer code and a left-hand-drive body code; their explanation still notes that export names may differ. Shanghai, Berlin, RHD and unmatched LFP variants retain the decoded drivetrain rather than a US range label.
- Cybertruck tri motor infers Cyberbeast; other trucks retain the decoded drivetrain. Semi and Cybercab range/equipment trims remain unknown.
- Unknown or future years do not inherit present-day marketing names. Missing fields and checksum mismatches remain attached to the result.

The estimate is entirely local and works offline. No photos, personal vehicle
records or credentials are fetched, and no individual VIN is hardcoded.

## VIN plus a model-year catalog can narrow the badge

The VIN's model, generation, year and motor/performance code can be matched
against trims offered in the relevant market. The result is an inference about
the original configuration, not a universal battery-capacity calculation.

The EPA/DOE API was queried with `Accept: application/json`:

- [2017 Tesla models](https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=2017&make=Tesla): includes both Model S AWD - P90D and Model S AWD - P100D, as well as both corresponding Model X variants. A performance-dual-motor VIN alone leaves multiple candidates.
- [2018 Tesla models](https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=2018&make=Tesla): Model S 75kWh, 75D, 100D and P100D; Model X 75D, 100D and P100D. For the US market, a 2018 S/X performance-dual-motor VIN narrows to P100D in this catalog.

This does not establish global trim availability, retrofits, software upgrades
or the current badge of an individual car. Missing catalog entries are not
proof that a trim never existed.

A public, independently labeled example is 2018 VIN `5YJSA1E47JF285662`:
[reseller window label identifying Model S P100D AWD](https://monroneylabels.com/cars/413182-2018-tesla-model-s/window_sticker.pdf?cfl=4860017395).
This is a reseller-generated label, not a verified original Tesla factory sticker.

## Vehicle-specific records can supply the missing information

### Software-screen photographs

[Tesla's badge replacement procedure](https://service.tesla.com/docs/ModelS/ServiceManual/en-au/air/GUID-E84B7A38-80A6-4809-B98F-F9E02C7FEBD4.html)
instructs technicians to check battery size and performance level on the
touchscreen; Controls > Software displays the vehicle badge.

For auction inventory, reading a clear software-screen photo is a practical
enrichment method. Match the visible VIN to the lot before using its badge.
Preserve the source image and observation date. Exterior badges provide weaker
evidence because they can be replaced. Do not estimate battery capacity from
the remaining range display alone.

### Owner-authorized Tesla data

[Tesla's available-data documentation](https://developer.tesla.com/docs/fleet-api/fleet-telemetry/available-data)
explicitly maps the `Trim` field to `vehicle_config.trim_badging`.
[Vehicle endpoints](https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-endpoints)
expose vehicle data, subject to vehicle support and availability.
[Customer authorization](https://developer.tesla.com/docs/fleet-api/authentication/third-party-tokens)
is required; this is not an anonymous lookup for arbitrary auction VINs.

Raw internal codes need model/generation-aware translation. For example,
[TeslaMate's identification code](https://github.com/teslamate-org/teslamate/blob/main/lib/teslamate/vehicles/vehicle.ex)
maps Model S + `P100D` + `lychee` to Plaid, and Model X + `P100D` + `tamarind`
to Plaid. Simply uppercasing an API code would mislabel these modern vehicles.

### Tesla parts catalog

[Tesla's public parts catalog](https://parts.tesla.com/en-US/landingpage) accepted
both investigated VINs without a sign-in and selected the appropriate Model S
generation. It offers an Original Fitment filter and marks Original VIN parts.

For `5YJSA1E59PF531239`, the original-fitment badge list returned only
`1056386-00-G`, the front Tesla T badge. The battery assembly list showed
`1111111-20-H`, described as ASY, HV BATTERY, P2, MSX. Neither observation
resolves a retail range/battery trim. A service replacement or compatible pack
must not be treated as proof of the original usable capacity or software unlocks.

The legacy P100D VIN selected the Apr 2016–Jan 2021 catalog, but its badge
assembly did not finish loading in this session. Therefore this investigation
does not establish that the catalog can return an exact P100D badge by VIN.

## Investigated VIN: 5YJSA1E59PF531239

- VIN decoding: 2023 Model S, Fremont, P2 dual motor. The motor code is 5; Tesla documents code 6 as P2 triple motor.
- Located in public auction records as Copart lot 55694386; [listing with photos](https://gobid.lt/en/copart/55694386/2023-tesla-model-s-5yjsa1e59pf531239).
- [Software-screen photo](https://cs.copart.com/v1/AUTH_svc.pdoc00001/ids-c-prod-lpp/0626/5a0d6f64493c4689a7b3f600d9c1b01b_hrs.jpg): matching VIN and visible badge **MODEL S**. No P100D or Plaid badge is displayed. This verifies the displayed model badge at the time of the photo; it does not independently establish a marketed Long Range versus Standard Range designation.
- [Certification-label photo](https://cs.copart.com/v1/AUTH_svc.pdoc00001/ids-c-prod-lpp/0626/62c255b10802441e85f870fa66c2eca8_vhrs.jpg): matching VIN and manufacture date **12/23**.

## Future vehicle-specific enrichment

1. Decode published VIN fields and validate the checksum.
2. Narrow candidates using a catalog scoped to model, generation, year and market.
3. Enrich with a matching software-screen image, vehicle-specific configuration or reliable original build documentation.
4. Store the display label, remaining candidates, evidence source, observation date and status (`confirmed`, `inferred`, `ambiguous` or `unknown`).
5. Keep original build trim, current software configuration and physical battery hardware separate. Report conflicts rather than silently picking a source.

For the investigated VIN, the defensible display is **2023 Model S — Dual Motor AWD**,
with **Model S** as the photo-verified software badge. An exact retail range tier
has not been independently established.
