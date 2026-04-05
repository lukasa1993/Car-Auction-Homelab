import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { AuctionStore } from "./auction-store";
import type { IngestPayload, ScrapedLotRecord } from "../lib/types";

const tempPaths: string[] = [];

afterEach(() => {
  while (tempPaths.length > 0) {
    const tempPath = tempPaths.pop();
    if (tempPath) {
      rmSync(tempPath, { force: true, recursive: true });
    }
  }
});

function createStore(): AuctionStore {
  const root = mkdtempSync(path.join(os.tmpdir(), "auction-store-"));
  tempPaths.push(root);
  return new AuctionStore({
    databasePath: path.join(root, "data", "auction.sqlite"),
    mediaDir: path.join(root, "media"),
  });
}

function createRecord(overrides: Partial<ScrapedLotRecord> = {}): ScrapedLotRecord {
  return {
    sourceKey: "copart",
    sourceLabel: "Copart",
    targetKey: "test-target",
    yearPage: 2021,
    carType: "Tesla Model 3",
    marker: "VIN · 5YJ3E1EA*",
    vinPattern: "5YJ3E1EA*",
    modelYear: 2021,
    vin: "5YJ3E1EA0MF000001",
    lotNumber: "12345678",
    sourceDetailId: "detail-1",
    vehicleTitle: "2021 Tesla Model 3",
    status: "upcoming",
    auctionDate: "2026-04-06T15:00:00Z",
    auctionDateRaw: "Apr 06 2026 3:00 PM UTC",
    location: "Atlanta, GA",
    url: "https://www.copart.com/lot/12345678/example",
    evidence: "seed evidence",
    ...overrides,
  };
}

function createPayload(records: ScrapedLotRecord[], overrides: Partial<IngestPayload["run"]> = {}): IngestPayload {
  return {
    run: {
      runnerId: "collector-1",
      runnerVersion: "2026.04.05.1",
      machineName: "test-machine",
      startedAt: "2026-04-05T10:00:00.000Z",
      completedAt: "2026-04-05T10:01:00.000Z",
      sourceKeys: ["copart"],
      scopes: [],
      ...overrides,
    },
    records,
  };
}

describe("AuctionStore ingest safeguards", () => {
  test("removes a VIN target by id", () => {
    const store = createStore();
    const targetId = store.upsertVinTarget({
      key: "test-target",
      vinPattern: "5YJ3E1EA*",
      label: "Model 3 test",
      carType: "Tesla Model 3",
      marker: "VIN · 5YJ3E1EA*",
      yearFrom: 2021,
      yearTo: 2021,
    });

    store.removeVinTarget(targetId);

    expect(store.getVinTargets().some((target) => target.id === targetId)).toBe(false);
  });

  test("preserves known lot fields when a later record is sparse", () => {
    const store = createStore();
    store.upsertVinTarget({
      key: "test-target",
      vinPattern: "5YJ3E1EA*",
      label: "Model 3 test",
      carType: "Tesla Model 3",
      marker: "VIN · 5YJ3E1EA*",
      yearFrom: 2021,
      yearTo: 2021,
    });

    store.ingest(createPayload([createRecord()]));
    store.ingest(createPayload([createRecord({
      sourceLabel: "",
      targetKey: "",
      yearPage: null,
      carType: "",
      marker: "",
      vinPattern: "",
      modelYear: null,
      vin: "",
      sourceDetailId: "",
      status: "unknown",
      auctionDate: "",
      auctionDateRaw: "",
      location: "",
      url: "",
      evidence: "",
    })], {
      runnerId: "collector-2",
      completedAt: "2026-04-05T11:01:00.000Z",
    }));

    const detail = store.getLotDetail("copart", "12345678");
    expect(detail).not.toBeNull();
    expect(detail?.lot.targetKey).toBe("test-target");
    expect(detail?.lot.carType).toBe("Tesla Model 3");
    expect(detail?.lot.marker).toBe("VIN · 5YJ3E1EA*");
    expect(detail?.lot.vinPattern).toBe("5YJ3E1EA*");
    expect(detail?.lot.vin).toBe("5YJ3E1EA0MF000001");
    expect(detail?.lot.modelYear).toBe(2021);
    expect(detail?.lot.sourceDetailId).toBe("detail-1");
    expect(detail?.lot.status).toBe("upcoming");
    expect(detail?.lot.auctionDate).toBe("2026-04-06T15:00:00Z");
    expect(detail?.lot.location).toBe("Atlanta, GA");
    expect(detail?.lot.url).toBe("https://www.copart.com/lot/12345678/example");
    expect(detail?.lot.evidence).toBe("seed evidence");
  });

  test("gives a zero-result complete scope one grace run before downgrading lots", () => {
    const store = createStore();
    store.upsertVinTarget({
      key: "test-target",
      vinPattern: "5YJ3E1EA*",
      label: "Model 3 test",
      carType: "Tesla Model 3",
      marker: "VIN · 5YJ3E1EA*",
      yearFrom: 2021,
      yearTo: 2021,
    });

    store.ingest(createPayload([createRecord()]));

    store.ingest(createPayload([], {
      runnerId: "collector-empty-1",
      completedAt: "2026-04-05T12:01:00.000Z",
      scopes: [{ sourceKey: "copart", targetKey: "test-target", status: "complete" }],
    }));

    let detail = store.getLotDetail("copart", "12345678");
    expect(detail).not.toBeNull();
    expect(detail?.lot.status).toBe("upcoming");
    expect(detail?.lot.missingCount).toBe(1);

    store.ingest(createPayload([], {
      runnerId: "collector-empty-2",
      completedAt: "2026-04-05T13:01:00.000Z",
      scopes: [{ sourceKey: "copart", targetKey: "test-target", status: "complete" }],
    }));

    detail = store.getLotDetail("copart", "12345678");
    expect(detail).not.toBeNull();
    expect(detail?.lot.status).toBe("missing");
    expect(detail?.lot.missingCount).toBe(2);
  });

  test("keeps an existing HD image when a later upload is clearly worse", () => {
    const store = createStore();
    store.upsertVinTarget({
      key: "test-target",
      vinPattern: "5YJ3E1EA*",
      label: "Model 3 test",
      carType: "Tesla Model 3",
      marker: "VIN · 5YJ3E1EA*",
      yearFrom: 2021,
      yearTo: 2021,
    });

    const initialRun = store.ingest(createPayload([createRecord()]));
    const hdImage = store.uploadLotImage({
      runId: initialRun.runId,
      sourceKey: "copart",
      lotNumber: "12345678",
      sourceUrl: "https://images.example/hd.jpg",
      sortOrder: 0,
      mimeType: "image/jpeg",
      width: 1600,
      height: 900,
      dataBase64: Buffer.from("good-image").toString("base64"),
    });

    const replacement = store.uploadLotImage({
      runId: initialRun.runId,
      sourceKey: "copart",
      lotNumber: "12345678",
      sourceUrl: "https://images.example/thumb.jpg",
      sortOrder: 0,
      mimeType: "image/jpeg",
      width: 320,
      height: 180,
      dataBase64: Buffer.from("bad-image").toString("base64"),
    });

    expect(replacement.id).toBe(hdImage.id);
    expect(replacement.sha256).toBe(hdImage.sha256);
    expect(replacement.sourceUrl).toBe(hdImage.sourceUrl);
  });
});
