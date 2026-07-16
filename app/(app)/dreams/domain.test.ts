import { describe, expect, it } from "vitest";
import {
  DREAM_CONTEXTS,
  DREAM_SCALES,
  parseDreamDelta,
  parseDreamInterviewResult,
  parseDreamVision,
} from "./types";

describe("dream system", () => {
  it("supports personal, business, and cross-context dreams at three scales", () => {
    expect(DREAM_CONTEXTS).toEqual(["personal", "business", "cross"]);
    expect(DREAM_SCALES).toEqual(["small", "big", "grand"]);
  });

  it("limits each guided interview round to one through three questions", () => {
    expect(
      parseDreamInterviewResult({
        questions: ["那一天醒来时，你首先看见什么？", "谁在你身边？"],
        missing_dimensions: ["愿意承担的代价"],
        ready_to_synthesize: false,
      }).questions
    ).toHaveLength(2);
    expect(() =>
      parseDreamInterviewResult({
        questions: ["1", "2", "3", "4"],
        missing_dimensions: [],
        ready_to_synthesize: false,
      })
    ).toThrow("questions");
  });

  it("builds a scene-first vision without task or schedule fields", () => {
    const vision = parseDreamVision({
      scene: {
        title: "一个不用催促自己的早晨",
        horizon: "一年后的春天",
        location: "海边的小城",
        people: ["伴侣"],
        sensory_details: ["窗外有海风", "桌上有刚煮好的咖啡"],
        actions: ["慢慢吃早餐", "写下当天最想研究的问题"],
        inner_state: "没有被未读消息推着走",
      },
      desired_changes: ["生活节奏由自己决定"],
      past_roots: ["过去长期被工作消息打断"],
      non_negotiables: ["不牺牲亲密关系"],
      costs: ["减少一部分短期收入"],
      assumptions: ["工作可以异步完成"],
      reality_signals: ["每周已有一天不看工作消息"],
      conflicts: ["事业增长速度可能下降"],
    });
    expect(vision.scene.actions).toContain("慢慢吃早餐");
    expect(vision).not.toHaveProperty("tasks");
    expect(vision).not.toHaveProperty("schedule");
  });

  it("stores version differences without judging progress", () => {
    expect(
      parseDreamDelta({
        scene_changes: ["地点从城市变为海边"],
        desired_change_updates: ["更重视关系时间"],
        assumption_changes: ["远程工作前提得到部分支持"],
        new_costs: ["减少线下社交"],
        resolved_conflicts: [],
        new_conflicts: ["与家人居住地点不同"],
        change_reason: "生活重心发生变化",
      }).new_conflicts
    ).toHaveLength(1);
  });
});
