import { describe, expect, it } from "vitest";
import {
  AssignmentGenerator,
  CoverStorySelector,
  DashboardEngine,
  EditorialDecisionEngine,
  EditorialDesk,
  IssuePlanner,
  PriorityEngine,
  RecommendationEngine,
  StoryLayer,
} from "../../src/editorial";
import { createEvent, EditorialDecisionType, EventStatus, EventType, makeStoryCandidate, StoryType } from "../../src/models";

async function event(overrides: Partial<Awaited<ReturnType<typeof createEvent>>> = {}) {
  const e = await createEvent({
    title: "T", artist: "A", eventType: EventType.ALBUM_RELEASE, description: "d", publishedAt: "2026-08-20",
  });
  Object.assign(e, overrides);
  return e;
}

describe("StoryLayer", () => {
  it("classifies by default_by_event_type when not breaking", async () => {
    const e = await event({ confidence: 10 });
    const storyType = new StoryLayer().classify(e, new Date("2026-08-25T00:00:00Z"));
    expect(storyType).toBe(StoryType.RELEASE);
  });

  it("classifies BREAKING when eligible+recent+high-confidence", async () => {
    const e = await event({ confidence: 90, publishedAt: "2026-08-20" });
    const storyType = new StoryLayer().classify(e, new Date("2026-08-21T00:00:00Z"));
    expect(storyType).toBe(StoryType.BREAKING);
  });

  it("override always wins", async () => {
    const e = await event();
    expect(new StoryLayer().classify(e, undefined, StoryType.FEATURE)).toBe(StoryType.FEATURE);
  });
});

describe("PriorityEngine", () => {
  it("matches the exact fixture priority values (111 / 61 / 27)", async () => {
    const engine = new PriorityEngine();

    const e1 = await event({ confidence: 70 });
    e1.mappingResult = { category: "Release", series: "tnc-records", profiles: [], tags: [], homepage: true, magazine: true, relatedProfiles: [], relatedSeries: [], searchWeight: 0 };
    const s1 = makeStoryCandidate(e1, StoryType.RELEASE);
    expect(engine.score(s1)).toBe(111);

    const e2 = await event({ confidence: 4, eventType: EventType.SINGLE_RELEASE });
    e2.mappingResult = { category: "Release", series: "tnc-tracks", profiles: [], tags: [], homepage: false, magazine: false, relatedProfiles: [], relatedSeries: [], searchWeight: 0 };
    const s2 = makeStoryCandidate(e2, StoryType.RELEASE);
    expect(engine.score(s2)).toBe(61);

    const e3 = await event({ confidence: 7, eventType: EventType.FESTIVAL });
    e3.mappingResult = { category: "Live Event", series: "tnc-radar", profiles: [], tags: [], homepage: false, magazine: false, relatedProfiles: [], relatedSeries: [], searchWeight: 0 };
    const s3 = makeStoryCandidate(e3, StoryType.COMMUNITY);
    expect(engine.score(s3)).toBe(27);
  });
});

describe("EditorialDecisionEngine", () => {
  it("status facts (LOW_CONFIDENCE/MERGED/REJECTED) win over priority", async () => {
    const engine = new EditorialDecisionEngine();

    const e = await event({ status: EventStatus.LOW_CONFIDENCE });
    const story = makeStoryCandidate(e, StoryType.RELEASE);
    story.priorityScore = 999;
    engine.decide(story);
    expect(story.decision).toBe(EditorialDecisionType.NEED_MORE_SOURCES);
  });

  it("publishes at/above the publish threshold", async () => {
    const e = await event({ status: EventStatus.PENDING_REVIEW });
    const story = makeStoryCandidate(e, StoryType.RELEASE);
    story.priorityScore = 70;
    new EditorialDecisionEngine().decide(story);
    expect(story.decision).toBe(EditorialDecisionType.PUBLISH);
  });

  it("holds between hold and publish thresholds", async () => {
    const e = await event({ status: EventStatus.PENDING_REVIEW });
    const story = makeStoryCandidate(e, StoryType.RELEASE);
    story.priorityScore = 50;
    new EditorialDecisionEngine().decide(story);
    expect(story.decision).toBe(EditorialDecisionType.HOLD);
  });
});

describe("RecommendationEngine", () => {
  it("relatedArticles includes same-artist or same-series stories from the pool", async () => {
    const e1 = await event({ title: "A" });
    e1.suggestedSeries = "tnc-records";
    const s1 = makeStoryCandidate(e1, StoryType.RELEASE);
    const e2 = await event({ title: "B" });
    e2.suggestedSeries = "tnc-records";
    const s2 = makeStoryCandidate(e2, StoryType.RELEASE);

    const recs = new RecommendationEngine().recommend(s1, [s1, s2]);
    expect(recs.relatedArticles).toEqual(["B"]); // s2's event title, same series as s1
  });
});

describe("AssignmentGenerator", () => {
  it("reuses MappingResult for series/category/tags/profiles, own suggestedLength", async () => {
    const e = await event();
    e.mappingResult = { category: "Release", series: "tnc-records", profiles: ["a"], tags: ["#TNC"], homepage: false, magazine: false, relatedProfiles: [], relatedSeries: [], searchWeight: 0 };
    const story = makeStoryCandidate(e, StoryType.RELEASE);
    const assignment = new AssignmentGenerator().generate(story, [story]);
    expect(assignment.suggestedSeries).toBe("tnc-records");
    expect(assignment.suggestedCategory).toBe("Release");
    expect(assignment.suggestedLength).toBe("400-600");
  });
});

describe("CoverStorySelector", () => {
  it("only picks PUBLISH-decision, eligible story types, above min priority", async () => {
    const e = await event();
    const story = makeStoryCandidate(e, StoryType.COMMUNITY); // not eligible
    story.decision = EditorialDecisionType.PUBLISH;
    story.priorityScore = 90;
    expect(new CoverStorySelector().candidates([story])).toEqual([]);
  });

  it("ranks eligible candidates by priority descending", async () => {
    const low = makeStoryCandidate(await event({ title: "Low" }), StoryType.RELEASE);
    low.decision = EditorialDecisionType.PUBLISH;
    low.priorityScore = 75;
    const high = makeStoryCandidate(await event({ title: "High" }), StoryType.RELEASE);
    high.decision = EditorialDecisionType.PUBLISH;
    high.priorityScore = 95;
    const result = new CoverStorySelector().candidates([low, high], 5);
    expect(result.map((s) => s.event.title)).toEqual(["High", "Low"]);
  });
});

describe("IssuePlanner", () => {
  it("seriesBalanceReport computes target/current/gap", () => {
    const report = new IssuePlanner().seriesBalanceReport({ "tnc-records": 1 });
    expect(report["tnc-records"]).toEqual({ target: 3, current: 1, gap: 2 });
  });

  it("suggestForIssue only ranks PUBLISH-decision stories", async () => {
    const story = makeStoryCandidate(await event(), StoryType.RELEASE);
    story.decision = EditorialDecisionType.HOLD;
    expect(new IssuePlanner().suggestForIssue([story], {})).toEqual([]);
  });

  it("suggestForIssue breaks ties within the same series-gap by priority descending", async () => {
    const low = makeStoryCandidate(await event({ title: "Low" }), StoryType.RELEASE);
    low.decision = EditorialDecisionType.PUBLISH;
    low.priorityScore = 50;
    const high = makeStoryCandidate(await event({ title: "High" }), StoryType.RELEASE);
    high.decision = EditorialDecisionType.PUBLISH;
    high.priorityScore = 90;

    const ranked = new IssuePlanner().suggestForIssue([low, high], {}, 5);
    expect(ranked.map((s) => s.event.title)).toEqual(["High", "Low"]);
  });
});

describe("DashboardEngine (Phase 3 stats)", () => {
  it("computes pending/highPriority/lowConfidence/duplicate/published/rejected", async () => {
    const publish = makeStoryCandidate(await event({ status: EventStatus.PENDING_REVIEW }), StoryType.RELEASE);
    publish.decision = EditorialDecisionType.PUBLISH;
    publish.priorityScore = 80;
    const stats = new DashboardEngine().compute([publish]);
    expect(stats.published).toBe(1);
    expect(stats.highPriority).toBe(1);
  });
});

describe("EditorialDesk", () => {
  it("process() runs the single-event path (Story->Priority->Decision->Assignment)", async () => {
    const e = await event({ confidence: 70, status: EventStatus.PENDING_REVIEW });
    e.mappingResult = { category: "Release", series: "tnc-records", profiles: [], tags: [], homepage: true, magazine: true, relatedProfiles: [], relatedSeries: [], searchWeight: 0 };
    const story = new EditorialDesk().process(e);
    expect(story.priorityScore).toBe(111);
    expect(story.decision).toBe(EditorialDecisionType.PUBLISH);
    expect(story.assignment).not.toBeNull();
  });

  it("processAll runs Story->Priority->Decision->Assignment for every event", async () => {
    const e1 = await event({ title: "A", confidence: 70, status: EventStatus.PENDING_REVIEW });
    e1.mappingResult = { category: "Release", series: "tnc-records", profiles: [], tags: [], homepage: true, magazine: true, relatedProfiles: [], relatedSeries: [], searchWeight: 0 };
    const stories = new EditorialDesk().processAll([e1]);
    expect(stories).toHaveLength(1);
    expect(stories[0]!.priorityScore).toBe(111);
    expect(stories[0]!.decision).toBe(EditorialDecisionType.PUBLISH);
    expect(stories[0]!.assignment).not.toBeNull();
  });
});
