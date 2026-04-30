import { describe, expect, test } from "bun:test";

import {
  findBestBidfaxMatch,
  isBidfaxChallengeHtml,
  parseBidfaxDetailHtml,
  parseBidfaxSearchHtml,
} from "./bidfax-parser";

const searchHtml = `
<div class="thumbnail offer">
  <div class="price"><i class="fa fa-dollar"></i><span class="prices">22500</span></div>
  <div class="caption">
    <a href="/electric/tesla-model-y-2023-white-vin-7saygdee3pa062871"><h2>Tesla Model Y 2023 White vin: 7SAYGDEE3PA062871</h2></a>
    <p class="short-storyup">Auction:&nbsp;<span class="copart">&nbsp;Copart&nbsp;</span><img src="/sold2.png" alt="Sold"></p>
    <p class="short-story">Lot number:&nbsp;<span class="blackfont">66434963</span></p>
    <p class="short-story2">Condition:&nbsp;<span class="blackfont">Run and Drive</span></p>
    <p class="short-story">Damage:&nbsp;<span class="blackfont">Minor dent / scratches</span></p>
    <p class="short-story2">Mileage:&nbsp;<span class="blackfont">2796 miles (Actual)</span></p>
    <p class="short-story">Date of sale:&nbsp;<span class="blackfont">15.11.2023</span></p>
  </div>
</div>`;

const detailHtml = `
<h1>Tesla Model Y 2023 White vin: 7SAYGDEE3PA062871</h1>
<div class="bidfax-price">Final bid:&nbsp;<i class="fa fa-dollar"></i><span class="prices">22500</span></div>
<p class="short-story">Auction:&nbsp;<span class="copart">&nbsp;Copart&nbsp;</span><img alt="Sold"></p>
<p class="short-story2">Lot number:&nbsp;<span class="blackfont">66434963</span></p>
<p class="short-story">Date of sale:&nbsp;<span class="blackfont">15.11.2023</span></p>
<p class="short-story2">Year:&nbsp;<span class="blackfont">2023</span></p>
<p class="short-story">VIN:&nbsp;<span class="blackfont">7SAYGDEE3PA062871</span></p>
<p class="short-story2">Condition:&nbsp;<span class="blackfont">Run and Drive</span></p>
<p class="short-story2">Mileage:&nbsp;<span class="blackfont">2796 miles (Actual)</span></p>
<p class="iaaiseller">Seller:&nbsp;Progressive</p>
<p class="short-story">Documents:&nbsp;<span class="blackfont">Cert of title-salvaged (MS)</span></p>
<p class="short-story2">Location:&nbsp;<span class="blackfont">MO - ST. LOUIS</span></p>
<p class="short-story">Primary Damage:&nbsp;<span class="blackfont">Minor dent / scratches</span></p>
<p class="short-story2">Secondary Damage:&nbsp;<span class="blackfont">-</span></p>
<p class="short-story2">Body color:&nbsp;<span class="blackfont">White</span></p>`;

describe("Bidfax parser", () => {
  test("parses sold search cards", () => {
    const sales = parseBidfaxSearchHtml(searchHtml);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({
      finalBidUsd: 22500,
      sourceKey: "copart",
      lotNumber: "66434963",
      vin: "7SAYGDEE3PA062871",
      saleDate: "2023-11-15",
      condition: "Run and Drive",
      damage: "Minor dent / scratches",
    });
    expect(sales[0].url).toBe("https://en.bidfax.info/electric/tesla-model-y-2023-white-vin-7saygdee3pa062871");
  });

  test("parses detail pages", () => {
    const sale = parseBidfaxDetailHtml(detailHtml, "https://en.bidfax.info/electric/tesla");
    expect(sale).not.toBeNull();
    expect(sale).toMatchObject({
      finalBidUsd: 22500,
      sourceKey: "copart",
      sourceLabel: "Copart",
      lotNumber: "66434963",
      vin: "7SAYGDEE3PA062871",
      saleDate: "2023-11-15",
      location: "MO - ST. LOUIS",
      color: "White",
      seller: "Progressive",
      documents: "Cert of title-salvaged (MS)",
    });
  });

  test("matches exact VIN and rejects mismatch", () => {
    const sales = parseBidfaxSearchHtml(searchHtml);
    const match = findBestBidfaxMatch(sales, {
      sourceKey: "copart",
      lotNumber: "66434963",
      vin: "7SAYGDEE3PA062871",
    });
    expect(match?.reason).toBe("vin-lot-source");
    expect(match?.confidence).toBe(1);

    const mismatch = findBestBidfaxMatch(sales, {
      sourceKey: "iaai",
      lotNumber: "66434963",
      vin: "7SAYGDEE3PA062872",
    });
    expect(mismatch).toBeNull();
  });

  test("detects challenge pages", () => {
    expect(isBidfaxChallengeHtml("<title>Just a moment...</title><script src=\"/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1\"></script>")).toBe(true);
  });
});
