import { describe, expect, it } from "vitest";
import {
  attachActiveClosures,
  isMissingWorkbenchSchemaError,
  sortWorkbenchObjects,
} from "./queries";

describe("workbench queries", () => {
  it("treats missing workbench schema as a soft-migration state", () => {
    expect(
      isMissingWorkbenchSchemaError({
        code: "PGRST205",
        message: "Could not find the table 'public.decision_objects'",
      })
    ).toBe(true);
  });

  it("attaches only the matching active closure to a decision object", () => {
    const objects = [
      {
        object_type: "reality_case" as const,
        object_id: "case-1",
        title: "现状课题",
        primary_module: "reality",
        status: "active" as const,
        href: "/reality/case-1",
        last_activity_at: "2026-07-10T00:00:00Z",
        current_closure: null,
      },
    ];
    const [withClosure] = attachActiveClosures(objects, [
      {
        id: "closure-1",
        object_type: "reality_case",
        object_id: "case-1",
        origin_module: "reality",
        title: "现状课题",
        current_judgment: "先看现实",
        critical_unknowns: ["还不知道真实限制"],
        options: [
          {
            label: "行动",
            when_to_choose: "需要接触现实",
            tradeoff: "会暴露错误",
            small_try: "问一个人",
          },
          {
            label: "暂不行动",
            when_to_choose: "信息不足",
            tradeoff: "进展变慢",
            small_try: "补一条事实",
          },
        ],
        selected_next_step: "问一个人",
        completion_criterion: "有一条反馈",
        expected_feedback: "知道是否有痛",
        due_on: "2026-07-12",
        basis_refs: ["reality:topic"],
        status: "active",
        created_at: "2026-07-10T00:00:00Z",
        closed_at: null,
      },
    ]);

    expect(withClosure.current_closure?.id).toBe("closure-1");
  });

  it("sorts due and recently active objects first", () => {
    const sorted = sortWorkbenchObjects([
      {
        object_type: "idea" as const,
        object_id: "old",
        title: "old",
        primary_module: "ideas",
        status: "active" as const,
        href: "/ideas/old",
        last_activity_at: "2026-07-01T00:00:00Z",
        current_closure: null,
      },
      {
        object_type: "idea" as const,
        object_id: "due",
        title: "due",
        primary_module: "ideas",
        status: "active" as const,
        href: "/ideas/due",
        last_activity_at: "2026-07-02T00:00:00Z",
        current_closure: {
          id: "closure-due",
          object_type: "idea",
          object_id: "due",
          origin_module: "ideas",
          title: "due",
          current_judgment: "判断",
          critical_unknowns: ["未知"],
          options: [
            {
              label: "行动",
              when_to_choose: "现在",
              tradeoff: "成本",
              small_try: "尝试",
            },
            {
              label: "不行动",
              when_to_choose: "信息不足",
              tradeoff: "变慢",
              small_try: "记录理由",
            },
          ],
          selected_next_step: "行动",
          completion_criterion: "完成",
          expected_feedback: "反馈",
          due_on: "2026-07-10",
          basis_refs: ["idea:summary"],
          status: "active",
          created_at: "2026-07-01T00:00:00Z",
          closed_at: null,
        },
      },
    ], "2026-07-10");

    expect(sorted[0].object_id).toBe("due");
  });
});
