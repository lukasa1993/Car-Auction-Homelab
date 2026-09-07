# Tesla VIN decoder

`public/vin.html` loads `public/tesla-trim-catalog.js`, `public/tesla-trims.js`
and `public/tesla-vin.js` as classic scripts. Keep the files together when
opening the page locally; decoding does not require a network request. The shared
auction model/year inference is in `src/lib/vin-patterns.ts`.

## Shareable VIN links

On the website, the decoder uses `/vin/<VIN>` (for example,
`/vin/5YJSA1E59PF531239`). Typing updates the current URL with `replaceState`
without reloading or adding a history entry for each character. Opening,
refreshing, or navigating back to a VIN URL restores the input and decoded trim.
The Copy link button copies the current URL and reports clipboard failures.

Prefixes and `*` masks can be shared. Clearing the input or entering malformed
VIN characters removes the old VIN from the URL; unsupported VINs still display
the normal decoder error. Older `/vin.html?vin=...` links are normalized to the
new path, while unrelated query parameters are preserved.

`public/_redirects` rewrites `/vin/*` to the extensionless `/vin` asset with
status 200, preserving the VIN path. The rewrite must target `/vin`, because
Cloudflare canonicalizes `/vin.html` back to `/vin`, which would otherwise lose
the VIN or create a redirect loop. See the
[Workers static asset redirect documentation](https://developers.cloudflare.com/workers/static-assets/redirects/).
The HTML sets its asset base to the site root on HTTP(S), so scripts load from
nested VIN paths. Local `file:` copies keep sibling scripts and use `#<VIN>`
instead, preserving offline operation.

Use the Cloudflare/Vite development server or a built Worker preview to test
path routing. A generic static file server must implement the equivalent
rewrite before `/vin/<VIN>` links can be opened directly.

Supported model identifiers: S (Model S), 3 (Model 3), X (Model X), Y (Model Y),
C (Cybertruck), T (Semi), and A (Cybercab). Original Roadster VINs (`SFZ`, or
`5YJR`) are explicitly excluded. Manufacturer codes cover the United States,
Shanghai and Berlin; the factory is decoded independently from position 11.

## Sources

Mappings checked on 2026-09-07 against these primary sources:

- [Model S, 2012–2021](https://service.tesla.com/docs/ModelS/ServiceManual/en-us/GUID-BED77626-E575-4DB7-8C1F-CFA600EAA082.html): early charger/battery codes, body changes, legacy numeric motors, and production-series prefixes.
- [Model S, 2021+](https://service.tesla.com/docs/ModelS/ServiceManual/Palladium/en-us/GUID-C79EB66B-D6DB-4439-BFC4-6AB53FB19E2C.html): motor 5 is dual; 6 is triple.
- [Model X, legacy](https://service.tesla.com/docs/ModelX/ServiceManual/en-us/GUID-B81908BE-D0D7-4E89-BD3A-FC3CA402C54F.html): motor 2 is standard dual; 4 is performance dual.
- [Model X, 2021+](https://service.tesla.com/docs/ModelX/ServiceManual/Palladium/en-au/air/GUID-C79EB66B-D6DB-4439-BFC4-6AB53FB19E2C.html): `7SA` also identifies Fremont-built Model X vehicles.
- [Model 3, original](https://service.tesla.com/docs/Model3/ServiceManual/en-au/air/GUID-0C797294-574D-4EE4-8017-C339A7D58411.html) and [2024+](https://service.tesla.com/docs/Model3/ServiceManual/2024/en-us/GUID-B7B9507C-C984-41F2-89EE-D23CA4E682ED.html): body, battery and old/new motor codes.
- [Model Y, original](https://service.tesla.com/docs/ModelY/ServiceManual/en-au/air/GUID-0C797294-574D-4EE4-8017-C339A7D58411.html) and [2025+](https://service.tesla.com/docs/ModelY/ServiceManual/2025/en-us/GUID-BB4CE449-3F8E-4905-AF4A-96DFA87535B5.html): global variants, restraints and calendar-year interpretation.
- [Tesla's MY2026 passenger-vehicle filing](https://vpic.nhtsa.dot.gov/mid/home/displayfile/8395b9ac-dfd8-4e16-8828-8b18e1b32ddd): manufacturer/model assignments and P2 motor definitions.
- [Tesla's MY2026 Cybertruck filing](https://vpic.nhtsa.dot.gov/mid/home/displayfile/ef945db7-686f-4f3d-980b-23bd8849c48b): `7G2`, single/dual/triple motors, and truck position 6 GVWR. This corrects the manufacturer codes and swapped body/restraint labels in the service-manual Cybertruck table.
- [Tesla's MY2023 Semi filing](https://vpic.nhtsa.dot.gov/mid/home/displayfile/caf05bbc-32a2-41ca-b55a-0fffc2ddc26d) and [MY2024 truck filing](https://vpic.nhtsa.dot.gov/mid/home/displayfile/ea70bdbf-c54d-4c5f-b426-85a8dd90890d): cab, GVWR, electric drive, air brakes and Reno plant.
- [NHTSA Cybercab record](https://vpic.nhtsa.dot.gov/decoder/VinDecoder?ModelYear=&VIN=5YJAJEEU9TAR03017): `5YJAJEEU*TA`, 2026, two-door hatchback, left-hand drive, electric, manual belts/passenger detection, Austin. The record does **not** specify motor count for U, so that field remains explicitly unknown.
- [Tesla's original Model S filing](https://vpic.nhtsa.dot.gov/mid/home/displayfile/5df993c3-03ab-485a-9895-7094402f40aa): year-code cycle.

## Behavior

- Accept full VINs, prefixes and positional `*` / `?` masks; normalize whitespace and case.
- Keep missing fields, unknown codes, unsupported models and malformed inputs distinct.
- Do not infer a Model Y from `7SA` alone, or infer a refresh generation solely from a model year: legacy and refreshed versions overlap in 2021 (S/X) and 2024 (3).
- Decode published motor meanings across those overlapping years. Early Model S body code B requires a year to distinguish LHD/AWD from later RHD.
- For full concrete VINs, calculate the position-9 check digit. A mismatch warns while retaining decoded fields; a partial VIN is never marked checksum-valid.
- Decode year and plant even when model or drivetrain information is unavailable. Shanghai/Berlin use the calendar year. Numeric year codes use the 2031–2039 cycle for these non-Roadster Teslas.
- Unknown or unpublished configurations stay visible, with a warning. Later year codes remain readable but their configuration tables are not claimed to be verified. VIN decoding does not establish every option, marketed trim, or the existence of a specific vehicle.

## Verification

Run `npm run test:vin` with Node 22.13+ (uses Node's built-in TypeScript stripping).
The suite exercises the page's actual classic script and shared auction
inference, using real regression VINs and explicitly partial descriptors from
the sources above. It covers all seven models, global WMIs, overlapping model
years, early Model S codes, truck field labels, checksums, masks, malformed
input and clearing stale UI results.
Trim tests cover P100D inference, ambiguous battery badges, S/X generation
overlap, Model 3/Y range alternatives, global/LFP fallbacks, future years,
checksum caveats and clearing stale trim sources.
Share-link tests cover direct restoration, typing/clearing, masks, malformed
URL encoding, browser navigation, clipboard failure, failed history updates and
local-file fragments. The built Worker was also checked over HTTP for direct
VIN URLs, trailing slashes, the legacy HTML URL and all decoder scripts.

## Retail trim enrichment

The decoder ends with a best-effort trim and vehicle description, using a
bundled US model-year catalog plus the published motor configuration. It shows
alternatives or a drivetrain label when the retail trim cannot be narrowed.
See [trim research](tesla-trim-research.md) for implementation details and
source evidence. Photo/API enrichment remains future work.
