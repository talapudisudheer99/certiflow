import { describe, expect, it } from "vitest";
import { canSeeEvent, type BatchEvent } from "../src/lib/events";

const event: BatchEvent = {
  type: "batch.reviewed",
  batchId: "batch-1",
  centreId: "centre-hyd",
  districtId: "district-north",
};

describe("live update visibility", () => {
  it("shows a batch only to its centre, its district, and quality or state", () => {
    expect(canSeeEvent({ role: "CENTRE", centreId: "centre-hyd", districtId: null }, event)).toBe(true);
    expect(canSeeEvent({ role: "CENTRE", centreId: "centre-other", districtId: null }, event)).toBe(false);
    expect(canSeeEvent({ role: "DISTRICT_OFFICER", districtId: "district-north" }, event)).toBe(true);
    expect(canSeeEvent({ role: "DISTRICT_OFFICER", districtId: "district-south" }, event)).toBe(false);
    expect(canSeeEvent({ role: "QUALITY" }, event)).toBe(true);
    expect(canSeeEvent({ role: "STATE" }, event)).toBe(true);
  });
});
