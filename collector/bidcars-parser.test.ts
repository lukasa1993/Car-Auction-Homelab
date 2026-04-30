import { describe, expect, test } from "bun:test";

import {
  buildBidcarsLotUrl,
  isBidcarsChallengeHtml,
  isBidcarsChallengeRendered,
  parseBidcarsDetailHtml,
  validateBidcarsSale,
} from "./bidcars-parser";

const detailHtml = `
<html>
<head>
  <title>2026 Tesla Model Y - Lot 77740985 - bid.cars</title>
  <script type="application/ld+json">{
    "@context": "https://schema.org",
    "@type": "Vehicle",
    "name": "2026 Tesla MODEL Y",
    "vehicleIdentificationNumber": "7SAYGDEE2TA575880",
    "offers": { "@type": "Offer", "price": "32500", "priceCurrency": "USD" }
  }</script>
</head>
<body>
<h1>2026 Tesla MODEL Y</h1>
<div class="lot-info">
  <div class="row"><span class="label">Lot #</span><span class="value">77740985</span></div>
  <div class="row"><span class="label">VIN</span><span class="value">7SAYGDEE2TA575880</span></div>
  <div class="row"><span class="label">Auction</span><span class="value">Copart</span></div>
  <div class="row"><span class="label">Sold for</span><span class="value">$32,500</span></div>
  <div class="row"><span class="label">Sale date</span><span class="value">2026-04-22</span></div>
  <div class="row"><span class="label">Odometer</span><span class="value">1,250 mi (Actual)</span></div>
  <div class="row"><span class="label">Primary damage</span><span class="value">Front End</span></div>
  <div class="row"><span class="label">Secondary damage</span><span class="value">Rear End</span></div>
  <div class="row"><span class="label">Location</span><span class="value">CA - LOS ANGELES</span></div>
  <div class="row"><span class="label">Color</span><span class="value">White</span></div>
  <div class="row"><span class="label">Title</span><span class="value">Certificate of Title - Salvage</span></div>
  <div class="row"><span class="label">Seller</span><span class="value">Tesla Inc</span></div>
  <div class="row"><span class="label">Condition</span><span class="value">Run and Drive</span></div>
</div>
</body>
</html>`;

describe("bid.cars parser", () => {
  test("builds direct lot URLs", () => {
    expect(buildBidcarsLotUrl("copart", "77740985")).toBe("https://bid.cars/en/lot/1-77740985");
    expect(buildBidcarsLotUrl("iaai", "12345678")).toBe("https://bid.cars/en/lot/0-12345678");
  });

  test("parses detail pages with labeled fields", () => {
    const sale = parseBidcarsDetailHtml(detailHtml, "https://bid.cars/en/lot/1-77740985/2026-Tesla-MODEL-Y-7SAYGDEE2TA575880");
    expect(sale).not.toBeNull();
    expect(sale).toMatchObject({
      finalBidUsd: 32500,
      sourceKey: "copart",
      sourceLabel: "Copart",
      lotNumber: "77740985",
      vin: "7SAYGDEE2TA575880",
      saleDate: "2026-04-22",
      saleDateRaw: "2026-04-22",
      condition: "Run and Drive",
      damage: "Front End",
      secondaryDamage: "Rear End",
      mileage: "1,250 mi (Actual)",
      location: "CA - LOS ANGELES",
      color: "White",
      seller: "Tesla Inc",
      documents: "Certificate of Title - Salvage",
    });
    expect(sale?.url).toBe("https://bid.cars/en/lot/1-77740985/2026-Tesla-MODEL-Y-7SAYGDEE2TA575880");
  });

  test("derives source and lot from URL when page lacks them", () => {
    const sparseHtml = `<h1>Some Vehicle</h1><span>Sold for $10,000</span><span>VIN: 7SAYGDEE2TA575880</span>`;
    const sale = parseBidcarsDetailHtml(sparseHtml, "https://bid.cars/en/lot/0-12345678/some-slug");
    expect(sale?.sourceKey).toBe("iaai");
    expect(sale?.lotNumber).toBe("12345678");
  });

  test("falls back to JSON-LD price when label parsing misses", () => {
    const jsonOnlyHtml = `
      <html>
      <script type="application/ld+json">{"@type":"Vehicle","vehicleIdentificationNumber":"7SAYGDEE2TA575880","offers":{"price":"15750"}}</script>
      <body><h1>Tesla</h1></body>
      </html>`;
    const sale = parseBidcarsDetailHtml(jsonOnlyHtml, "https://bid.cars/en/lot/1-77740985");
    expect(sale?.finalBidUsd).toBe(15750);
    expect(sale?.vin).toBe("7SAYGDEE2TA575880");
  });

  test("returns null when no useful fields are present", () => {
    expect(parseBidcarsDetailHtml("<h1>nothing</h1>", "https://bid.cars/en/lot/foo")).toBeNull();
  });

  test("validates sale against target", () => {
    const sale = parseBidcarsDetailHtml(detailHtml, "https://bid.cars/en/lot/1-77740985/2026-Tesla-MODEL-Y-7SAYGDEE2TA575880");
    expect(sale).not.toBeNull();
    if (!sale) return;

    const exact = validateBidcarsSale(sale, { sourceKey: "copart", lotNumber: "77740985", vin: "7SAYGDEE2TA575880" });
    expect(exact?.confidence).toBe(1);
    expect(exact?.reason).toBe("vin-lot-source");

    const lotOnly = validateBidcarsSale(sale, { sourceKey: "copart", lotNumber: "77740985", vin: "DIFFERENTVIN12345" });
    expect(lotOnly?.reason).toBe("lot-source");

    const wrongLot = validateBidcarsSale(sale, { sourceKey: "copart", lotNumber: "99999999", vin: null });
    expect(wrongLot).toBeNull();
  });

  test("detects Cloudflare challenge pages from raw HTML", () => {
    expect(isBidcarsChallengeHtml("<title>Just a moment...</title>")).toBe(true);
    expect(isBidcarsChallengeHtml("<form id=\"challenge-form\" action=\"/\"></form>")).toBe(true);
    expect(isBidcarsChallengeHtml("<div id=\"challenge-running\"></div>")).toBe(true);
    expect(isBidcarsChallengeHtml("<div id=\"challenge-stage\"></div>")).toBe(true);
    expect(isBidcarsChallengeHtml("<h1>Real page content here</h1>")).toBe(false);
    // Plain script reference to the cdn-cgi endpoint is left on every cleared bid.cars page,
    // so it must not be treated as a challenge by itself.
    expect(
      isBidcarsChallengeHtml("<script src=\"/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1\"></script>"),
    ).toBe(false);
  });

  test("detects Cloudflare challenge pages from rendered title and body", () => {
    expect(isBidcarsChallengeRendered("Just a moment...", "")).toBe(true);
    expect(isBidcarsChallengeRendered("", "Verify you are human by completing the action below.")).toBe(true);
    expect(isBidcarsChallengeRendered("", "Checking your browser before accessing bid.cars")).toBe(true);
    expect(isBidcarsChallengeRendered("", "Please enable JavaScript and cookies to continue.")).toBe(true);
    expect(isBidcarsChallengeRendered("2026 Tesla MODEL Y - Lot 77740985", "Sold for $32,500 VIN 7SAYGDEE2TA575880")).toBe(false);
  });

  test("parses date variants", () => {
    const us = parseBidcarsDetailHtml(
      `<div><span class="label">Lot #</span><span>77740985</span></div><div><span class="label">Sale date</span><span>04/22/2026</span></div><div>VIN: 7SAYGDEE2TA575880</div><div>Sold for $10,000</div>`,
      "https://bid.cars/en/lot/1-77740985",
    );
    expect(us?.saleDate).toBe("2026-04-22");

    const named = parseBidcarsDetailHtml(
      `<div><span class="label">Lot #</span><span>77740985</span></div><div><span class="label">Sale date</span><span>Apr 22, 2026</span></div><div>VIN: 7SAYGDEE2TA575880</div><div>Sold for $10,000</div>`,
      "https://bid.cars/en/lot/1-77740985",
    );
    expect(named?.saleDate).toBe("2026-04-22");
  });
});
