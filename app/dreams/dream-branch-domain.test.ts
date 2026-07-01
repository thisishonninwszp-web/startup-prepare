import { describe, expect, it } from "vitest";
import {
  applyDreamCanvasPatches,
  emptyDreamCanvas,
  parseDreamBranchComparison,
  parseDreamBranchSuggestions,
  parseDreamCanvas,
  parseDreamTurn,
  projectDreamCanvas,
  resolveDreamCanvasItem,
  canCreateDreamBranch,
  confirmedDreamCanvas,
  upsertConfirmedDreamCanvasItem,
  removeDreamCanvasItem,
  validateExplicitDreamPatches,
  validateDreamInferenceReferences,
  validateDreamPhaseTransition,
  type DreamBranchMessage,
} from "./types";

const message: DreamBranchMessage = {
  id: "11111111-1111-4111-8111-111111111111",
  branch_id: "22222222-2222-4222-8222-222222222222",
  role: "user",
  content: "上周独自在海边散步时，我第一次觉得时间属于自己。",
  created_at: "2026-06-28T00:00:00.000Z",
};

describe("single-question dream interview", () => {
  it("accepts exactly one next question with grounded canvas proposals", () => {
    const turn = parseDreamTurn({
      question: "那一刻，什么让你感觉时间属于自己？",
      phase: "memory_bridge",
      target_dimension: "memory_fragments",
      explicit_patches: [
        {
          dimension: "memory_fragments",
          text: "独自在海边散步",
          source_quote: "独自在海边散步",
          source_message_id: message.id,
        },
      ],
      inferences: [
        {
          dimension: "inner_state",
          text: "希望拥有不被催促的生活",
          source_message_ids: [message.id],
        },
      ],
      unknown_dimensions: ["people"],
      ready_to_synthesize: false,
    });

    expect(turn.question).toContain("什么");
    expect(turn).not.toHaveProperty("questions");
    expect(turn.inferences[0].status).toBe("pending");
  });

  it("keeps interview phases sequential", () => {
    expect(() =>
      validateDreamPhaseTransition("memory_bridge", "people")
    ).toThrow("阶段");
    expect(() =>
      validateDreamPhaseTransition("future_day", "future_day")
    ).not.toThrow();
    expect(() =>
      validateDreamPhaseTransition("future_day", "people")
    ).not.toThrow();
  });

  it("rejects a fabricated explicit quote", () => {
    const turn = parseDreamTurn({
      question: "未来那一天在哪里？",
      phase: "future_day",
      target_dimension: "location",
      explicit_patches: [
        {
          dimension: "location",
          text: "京都",
          source_quote: "我住在京都",
          source_message_id: message.id,
        },
      ],
      inferences: [],
      unknown_dimensions: [],
      ready_to_synthesize: false,
    });

    expect(() =>
      validateExplicitDreamPatches(
        turn.explicit_patches,
        [message],
        message.branch_id
      )
    ).toThrow("原话");
  });

  it("rejects paraphrased text disguised as an explicit quote", () => {
    const turn = parseDreamTurn({
      question: "那一刻为什么重要？",
      phase: "meaning",
      target_dimension: "desired_changes",
      explicit_patches: [
        {
          dimension: "desired_changes",
          text: "我渴望完全自由的人生",
          source_quote: "时间属于自己",
          source_message_id: message.id,
        },
      ],
      inferences: [],
      unknown_dimensions: [],
      ready_to_synthesize: false,
    });
    expect(() =>
      validateExplicitDreamPatches(
        turn.explicit_patches,
        [message],
        message.branch_id
      )
    ).toThrow("逐字");
  });

  it("rejects a cross-branch message reference", () => {
    const turn = parseDreamTurn({
      question: "未来那一天在哪里？",
      phase: "future_day",
      target_dimension: "location",
      explicit_patches: [
        {
          dimension: "location",
          text: "海边",
          source_quote: "海边",
          source_message_id: message.id,
        },
      ],
      inferences: [],
      unknown_dimensions: [],
      ready_to_synthesize: false,
    });

    expect(() =>
      validateExplicitDreamPatches(
        turn.explicit_patches,
        [message],
        "33333333-3333-4333-8333-333333333333"
      )
    ).toThrow("分支");
  });

  it("allows reality sources only in folded reality dimensions", () => {
    expect(() =>
      validateDreamInferenceReferences(
        [
          {
            dimension: "location",
            text: "住在东京",
            source_message_ids: [],
            source_ids: ["reality:r1"],
            status: "pending",
          },
        ],
        new Set(),
        new Set(["reality:r1"])
      )
    ).toThrow("现实来源");
    expect(() =>
      validateDreamInferenceReferences(
        [
          {
            dimension: "assumptions",
            text: "远程工作需要继续成立",
            source_message_ids: [],
            source_ids: ["reality:r1"],
            status: "pending",
          },
        ],
        new Set(),
        new Set(["reality:r1"])
      )
    ).not.toThrow();
  });
});

describe("confirmed canvas projection", () => {
  it("auto-confirms grounded quotes but leaves inference pending", () => {
    const turn = parseDreamTurn({
      question: "未来那一天在哪里？",
      phase: "future_day",
      target_dimension: "location",
      explicit_patches: [
        {
          dimension: "location",
          text: "海边",
          source_quote: "海边",
          source_message_id: message.id,
        },
      ],
      inferences: [
        {
          dimension: "inner_state",
          text: "内心平静",
          source_message_ids: [message.id],
        },
      ],
      unknown_dimensions: ["people"],
      ready_to_synthesize: false,
    });
    const canvas = applyDreamCanvasPatches(
      emptyDreamCanvas(),
      turn,
      0
    );

    expect(canvas.revision).toBe(1);
    expect(canvas.content.location[0].status).toBe("confirmed");
    expect(canvas.content.inner_state[0].status).toBe("pending");
  });

  it("projects only confirmed content and preserves unknown dimensions", () => {
    const canvas = emptyDreamCanvas();
    canvas.content.location.push({
      id: "location-1",
      text: "海边",
      origin: "explicit",
      status: "confirmed",
      source_message_ids: [message.id],
    });
    canvas.content.inner_state.push({
      id: "state-1",
      text: "永远不会焦虑",
      origin: "inferred",
      status: "pending",
      source_message_ids: [message.id],
    });

    const vision = projectDreamCanvas(canvas);
    expect(vision.scene.location).toBe("海边");
    expect(vision.scene.inner_state).toBe("尚未看清");
    expect(vision.scene.actions).toEqual(["尚未看清"]);
    expect(confirmedDreamCanvas(canvas).content.inner_state).toEqual([]);
  });

  it("rejects malformed stored canvas entries", () => {
    expect(() =>
      parseDreamCanvas({
        revision: 0,
        content: {
          ...emptyDreamCanvas().content,
          location: [{ text: "海边", status: "confirmed" }],
        },
      })
    ).toThrow("location");
  });

  it("accepts a non-negative integer revision returned as database text", () => {
    const canvas = parseDreamCanvas({
      revision: "0",
      content: emptyDreamCanvas().content,
    });

    expect(canvas.revision).toBe(0);
  });

  it("requires the current revision when accepting an inference", () => {
    const canvas = emptyDreamCanvas();
    canvas.content.inner_state.push({
      id: "pending-1",
      text: "内心平静",
      origin: "inferred",
      status: "pending",
      source_message_ids: [message.id],
    });
    expect(() =>
      resolveDreamCanvasItem(canvas, "pending-1", "accept", 1)
    ).toThrow("最新");
    expect(
      resolveDreamCanvasItem(canvas, "pending-1", "accept", 0)
        .content.inner_state[0].status
    ).toBe("confirmed");
  });

  it("supports explicit user edits and deletion with revision checks", () => {
    const updated = upsertConfirmedDreamCanvasItem(
      emptyDreamCanvas(),
      "actions",
      null,
      "慢慢吃早餐",
      0
    );
    expect(updated.content.actions[0].origin).toBe("user");
    const removed = removeDreamCanvasItem(
      updated,
      "actions",
      updated.content.actions[0].id,
      1
    );
    expect(removed.content.actions).toEqual([]);
    expect(removed.revision).toBe(2);
  });
});

describe("future branches", () => {
  it("allows at most three grounded suggestions and no scores", () => {
    const suggestions = parseDreamBranchSuggestions({
      suggestions: [
        {
          label: "保留自由",
          fork_question: "如果优先保留自由，那一天会怎样？",
          tradeoff: "接受增长更慢",
          source_message_ids: [message.id],
        },
        {
          label: "扩大影响",
          fork_question: "如果优先扩大影响，那一天会怎样？",
          tradeoff: "接受更少独处时间",
          source_message_ids: [message.id],
        },
      ],
    });
    expect(suggestions.suggestions).toHaveLength(2);
    expect(suggestions.suggestions[0]).not.toHaveProperty("score");
  });

  it("rejects branch comparisons that recommend a winner", () => {
    expect(() =>
      parseDreamBranchComparison({
        common_ground: ["都重视自主时间"],
        differences: [],
        unknowns: ["收入结构"],
        recommendation: "选择A",
      })
    ).toThrow("推荐");
    expect(() =>
      parseDreamBranchComparison({
        common_ground: [],
        differences: [
          {
            dimension: "actions",
            branches: [
              { branch_id: "a", summary: "更多独处", score: 8 },
            ],
          },
        ],
        unknowns: [],
      })
    ).toThrow("评分");
  });

  it("limits a dream to five active branches", () => {
    expect(canCreateDreamBranch(4)).toBe(true);
    expect(canCreateDreamBranch(5)).toBe(false);
  });
});
