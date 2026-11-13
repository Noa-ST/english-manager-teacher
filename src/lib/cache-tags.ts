/**
 * Cache tags shared by viewer reads (`use cache` + cacheTag) and admin
 * mutations (updateTag / revalidateTag). Never inline tag strings elsewhere.
 * Tags are stored in plain text: use stable IDs only, never personal data.
 */
export const CacheTags = {
  announcements: "announcements",
  podcasts: "podcasts",
  hallOfFame: "hall-of-fame",
  showcase: "showcase",
  documents: "documents",
  schedule: "schedule",
  student: (studentId: string) => `student:${studentId}`,
} as const;

