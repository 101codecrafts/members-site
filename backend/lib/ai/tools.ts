import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { retrieve } from "./knowledge";
import { COURSES, LEARNING_PATHS, type Course, type PathId } from "./site-content";
import { publicClient } from "./supabase";
import {
  eventSchema,
  explainCodeInput,
  formatEvents,
  howToJoin,
  listEventsInput,
  prepareCodeExplanation,
  recommendLearningPath,
  recommendPathInput,
  searchCourses,
  searchCoursesInput,
  type EventRow,
} from "./tool-logic";

/** Data sources are injectable so tests and local dev work without Supabase. */
export type ToolDeps = {
  getCourses: () => Promise<Course[]>;
  getEvents: () => Promise<EventRow[]>;
};

const dbCourse = z.object({
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable().optional(),
  level: z.enum(["beginner", "intermediate", "advanced"]).catch("beginner"),
  tags: z.array(z.string()).nullable().optional(),
  path_courses: z
    .array(z.object({ learning_paths: z.object({ slug: z.string(), title: z.string() }).nullable() }))
    .nullable()
    .optional(),
});

function matchPathId(slug?: string, title?: string): PathId | null {
  const s = `${slug ?? ""} ${title ?? ""}`.toLowerCase();
  const hit = LEARNING_PATHS.find((p) => s.includes(p.id) || s.includes(p.name.toLowerCase().split(" ")[0]!));
  return hit?.id ?? null;
}

/** Published courses from the backend `courses` table, merged with the draft outline. */
export async function liveCourses(): Promise<Course[]> {
  const sb = publicClient();
  if (!sb) return COURSES;
  try {
    const { data, error } = await sb
      .from("courses")
      .select("slug,title,summary,level,tags,path_courses(learning_paths(slug,title))")
      .eq("status", "published")
      .is("deleted_at", null)
      .limit(200);
    if (error) throw error;
    const rows = z.array(dbCourse).parse(data ?? []);
    const published: Course[] = rows.flatMap((r) => {
      const lp = r.path_courses?.find((pc) => pc.learning_paths)?.learning_paths;
      const pathId = matchPathId(lp?.slug, lp?.title) ?? matchPathId((r.tags ?? []).join(" "), r.title);
      if (!pathId) return [];
      return [
        {
          id: r.slug,
          title: r.title,
          pathId,
          level: r.level,
          summary: r.summary ?? "",
          topics: r.tags ?? [],
          status: "published" as const,
          url: `/courses/${r.slug}`,
        },
      ];
    });
    return published.length ? [...published, ...COURSES] : COURSES;
  } catch (err) {
    console.warn("[ai] courses table unavailable, using outline:", (err as Error).message);
    return COURSES;
  }
}

export async function liveEvents(): Promise<EventRow[]> {
  const sb = publicClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("events")
      .select("slug,title,description,starts_at,ends_at,timezone,location,is_online,price_ugx")
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(20);
    if (error) throw error;
    return z.array(eventSchema).parse(data ?? []);
  } catch (err) {
    console.warn("[ai] events table unavailable:", (err as Error).message);
    return [];
  }
}

export const defaultToolDeps: ToolDeps = { getCourses: liveCourses, getEvents: liveEvents };

export function createAssistantTools(deps: ToolDeps = defaultToolDeps) {
  return {
    searchKnowledge: tool({
      description:
        "Search the 101 Codecrafts knowledge base (FAQ, learning paths, course outlines, tools). Use for any factual question about 101 Codecrafts that the provided <knowledge> block does not already answer.",
      inputSchema: z.object({ query: z.string().trim().min(2).max(300) }),
      execute: async ({ query }) => {
        const { docs } = await retrieve(query, 4);
        return {
          results: docs.map((d) => ({
            title: d.title,
            url: d.url,
            excerpt: d.content.slice(0, 700),
            needsConfirmation: d.needsConfirmation,
          })),
        };
      },
    }),
    searchCourses: tool({
      description: "Find 101 Codecrafts courses/modules by topic, optionally filtered by learning path or level.",
      inputSchema: searchCoursesInput,
      execute: async (input) => {
        const hits = searchCourses(input, await deps.getCourses());
        return {
          courses: hits.map((c) => ({
            title: c.title,
            path: c.pathName,
            level: c.level,
            summary: c.summary,
            status: c.status === "draft" ? "outline (not yet scheduled)" : "published",
            url: c.url ?? `/learn#${c.pathId}`,
          })),
        };
      },
    }),
    listUpcomingEvents: tool({
      description: "List upcoming published 101 Codecrafts events (workshops, webinars, hackathons, meetups). Never invent events.",
      inputSchema: listEventsInput,
      execute: async (input) => formatEvents(await deps.getEvents(), input),
    }),
    recommendLearningPath: tool({
      description:
        "Recommend one or two of the six 101 Codecrafts learning paths from the learner's interests, experience, weekly hours and goal. Ask the learner about their interests first if unknown.",
      inputSchema: recommendPathInput,
      execute: async (input) => {
        const recs = recommendLearningPath(input, await deps.getCourses());
        return {
          recommendations: recs.map((r) => ({
            path: r.path.name,
            summary: r.path.summary,
            why: r.reasons,
            prerequisites: r.path.prerequisites,
            careers: r.path.careers,
            startWith: r.firstCourses.map((c) => c.title),
            weeklyPlan: r.weeklyPlan,
            url: `/learn#${r.path.id}`,
          })),
        };
      },
    }),
    explainCode: tool({
      description: "Prepare to explain a code snippet the learner pasted. Call this, then write the explanation yourself.",
      inputSchema: explainCodeInput,
      execute: async (input) => prepareCodeExplanation(input),
    }),
    showHowToJoin: tool({
      description: "Get the official steps to join 101 Codecrafts, with links.",
      inputSchema: z.object({}),
      execute: async () => howToJoin(),
    }),
  };
}

export type AssistantTools = ReturnType<typeof createAssistantTools>;
