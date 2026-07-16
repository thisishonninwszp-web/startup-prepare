import { supabaseAdmin } from "@/lib/supabase";
import {
  getReflectionSettings,
  listDailyReflections,
  todayInTimezone,
} from "@/app/(app)/retrospectives/queries";

export type DreamAnchor = {
  id: string;
  title: string;
  scene_title: string | null;
  inner_state: string | null;
};

export type DomainCard = {
  tag: string;
  idea_count: number;
  by_status: Record<string, number>;
  latest_activity: string | null;
  is_stale: boolean;
};

export type ActivitySummary = {
  new_ideas: number;
  new_validations: number;
  new_decisions: number;
  most_active_domain: string | null;
};

export type LifeCompassData = {
  dreams: DreamAnchor[];
  domains: DomainCard[];
  activity: ActivitySummary;
  has_enough_data: boolean;
};

export async function getLifeCompassData(userId: string): Promise<LifeCompassData> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const ideaIdsResult = await supabaseAdmin
    .from("ideas")
    .select("id")
    .eq("user_id", userId);
  const ideaIds = (ideaIdsResult.data ?? []).map((r) => r.id as string);

  const [dreamCasesResult, ideasResult, recentValidationsResult, recentDecisionsResult] =
    await Promise.all([
      supabaseAdmin
        .from("dream_cases")
        .select("id, title")
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(3),
      supabaseAdmin
        .from("ideas")
        .select("id, status, tags, last_activity_at, created_at")
        .eq("user_id", userId),
      ideaIds.length > 0
        ? supabaseAdmin
            .from("validations")
            .select("idea_id, contacted_at")
            .in("idea_id", ideaIds)
            .gte("contacted_at", thirtyDaysAgo)
        : Promise.resolve({ data: [], error: null }),
      ideaIds.length > 0
        ? supabaseAdmin
            .from("decisions")
            .select("idea_id, decided_at")
            .in("idea_id", ideaIds)
            .gte("decided_at", thirtyDaysAgo)
        : Promise.resolve({ data: [], error: null }),
    ]);

  // Fetch latest dream version vision for each case
  const dreamCases = dreamCasesResult.data ?? [];
  const dreams: DreamAnchor[] = [];
  for (const dc of dreamCases) {
    const { data: versions } = await supabaseAdmin
      .from("dream_versions")
      .select("vision")
      .eq("case_id", dc.id)
      .order("version_no", { ascending: false })
      .limit(1);
    const vision = versions?.[0]?.vision as Record<string, unknown> | null;
    const scene = vision?.scene as Record<string, unknown> | null;
    dreams.push({
      id: dc.id as string,
      title: dc.title as string,
      scene_title: typeof scene?.title === "string" ? scene.title : null,
      inner_state: typeof vision?.inner_state === "string" ? vision.inner_state : null,
    });
  }

  // Build domain cards from idea tags
  const ideas = ideasResult.data ?? [];
  const tagMap = new Map<string, { ideas: typeof ideas; activity_dates: string[] }>();

  for (const idea of ideas) {
    const tags: string[] = Array.isArray(idea.tags) && idea.tags.length > 0
      ? (idea.tags as string[])
      : ["未分类"];

    for (const tag of tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, { ideas: [], activity_dates: [] });
      const entry = tagMap.get(tag)!;
      entry.ideas.push(idea);
      if (idea.last_activity_at) entry.activity_dates.push(idea.last_activity_at as string);
    }
  }

  // Sort by idea count desc, limit 8
  const sortedTags = Array.from(tagMap.entries())
    .sort((a, b) => b[1].ideas.length - a[1].ideas.length)
    .slice(0, 8);

  const domains: DomainCard[] = sortedTags.map(([tag, { ideas: tagIdeas, activity_dates }]) => {
    const by_status: Record<string, number> = {};
    for (const idea of tagIdeas) {
      const s = idea.status as string;
      by_status[s] = (by_status[s] ?? 0) + 1;
    }
    const latest_activity = activity_dates.length > 0
      ? activity_dates.sort().reverse()[0]
      : null;
    const is_stale = latest_activity !== null ? latest_activity < fourteenDaysAgo : tagIdeas.length > 0;

    return { tag, idea_count: tagIdeas.length, by_status, latest_activity, is_stale };
  });

  // 30-day activity summary
  const recentIdeas = ideas.filter((i) => (i.created_at as string) >= thirtyDaysAgo);
  const recentValidations = recentValidationsResult.data ?? [];
  const recentDecisions = recentDecisionsResult.data ?? [];

  // Most active domain: tag with most recent ideas in last 30 days
  const domainActivity = new Map<string, number>();
  for (const idea of recentIdeas) {
    const tags: string[] = Array.isArray(idea.tags) && idea.tags.length > 0
      ? (idea.tags as string[])
      : ["未分类"];
    for (const tag of tags) {
      domainActivity.set(tag, (domainActivity.get(tag) ?? 0) + 1);
    }
  }
  const most_active_domain = domainActivity.size > 0
    ? Array.from(domainActivity.entries()).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  const activity: ActivitySummary = {
    new_ideas: recentIdeas.length,
    new_validations: recentValidations.length,
    new_decisions: recentDecisions.length,
    most_active_domain,
  };

  const has_enough_data = ideas.length >= 3 || dreams.length > 0;

  return { dreams, domains, activity, has_enough_data };
}

// ── 注意力去向可视化 ──────────────────────────────────────────────────────────

export type AttentionCategoryMinutes = {
  key: string;
  label: string;
  color: string;
  minutes: number;
};

/** 过去30天，实际时间花在哪个分类上（复用复盘的确认时间块，只算已确认的天）。 */
export async function getAttentionAllocation(
  userId: string
): Promise<AttentionCategoryMinutes[]> {
  const settings = await getReflectionSettings(userId);
  const today = todayInTimezone(settings.timezone);
  const thirtyDaysAgo = new Date(
    new Date(`${today}T00:00:00.000Z`).getTime() - 30 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  const days = await listDailyReflections(userId, thirtyDaysAgo, today);

  const minutesByCategory = new Map<string, number>();
  for (const day of days) {
    if (day.status !== "confirmed") continue;
    for (const block of day.daily_time_blocks ?? []) {
      const minutes = (block.end_slot - block.start_slot) * 30;
      minutesByCategory.set(
        block.category_key,
        (minutesByCategory.get(block.category_key) ?? 0) + minutes
      );
    }
  }

  return settings.categories
    .map((c) => ({
      key: c.key,
      label: c.label,
      color: c.color,
      minutes: minutesByCategory.get(c.key) ?? 0,
    }))
    .filter((c) => c.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}
