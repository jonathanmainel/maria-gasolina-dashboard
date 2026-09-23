import { describe, expect, it } from "vitest";
import {
  getActionValue,
  getMetaAccountStatusLabel,
  summarizeActionTypes,
} from "./meta-ads.ts";

describe("Meta Ads helpers", () => {
  it("uses only the exact lead action without summing overlapping aliases", () => {
    const actions = [
      { action_type: "lead", value: "12" },
      { action_type: "onsite_conversion.lead_grouped", value: "12" },
      { action_type: "offsite_complete_registration_add_meta_leads", value: "12" },
    ];

    expect(getActionValue(actions, "lead")).toBe(12);
  });

  it("summarizes action types deterministically", () => {
    expect(summarizeActionTypes([
      { actions: [{ action_type: "lead", value: "2" }] },
      {
        actions: [
          { action_type: "link_click", value: "5" },
          { action_type: "lead", value: "3" },
        ],
      },
    ])).toEqual([
      { action_type: "lead", value: 5 },
      { action_type: "link_click", value: 5 },
    ]);
  });

  it("labels known and unknown account statuses", () => {
    expect(getMetaAccountStatusLabel(1)).toBe("ACTIVE");
    expect(getMetaAccountStatusLabel(999)).toBe("UNKNOWN_999");
    expect(getMetaAccountStatusLabel(undefined)).toBeNull();
  });
});
