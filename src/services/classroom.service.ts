import { z } from "zod";

import type { ClassroomGroup } from "./classroom-data";
import { idSchema, validate } from "./common";
import { NotFoundError } from "./errors";
import { getRuntimeStore } from "./runtime-store";

export const createClassroomSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  level: z.string().trim().min(1).max(60).default("CEFR B2"),
  targetBand: z.string().trim().min(1).max(80).default("IELTS 6.5–7.5+"),
  scheduleSummary: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .default("Thứ 3 & Thứ 6 · 18:00 – 20:00"),
  room: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default("Phòng 302 · Cơ sở Nguyễn Du"),
  capacity: z.coerce.number().int().min(5).max(50).default(15),
  currentModule: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .default("Module 1: Critical Reading & Essay Architecture"),
});
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;

export const updateClassroomSchema = createClassroomSchema.partial();

export async function listClassrooms(): Promise<ClassroomGroup[]> {
  return getRuntimeStore().classrooms;
}

export async function createClassroom(input: unknown): Promise<ClassroomGroup> {
  const data = validate(createClassroomSchema, input);
  const store = getRuntimeStore();

  const newClassroom: ClassroomGroup = {
    id: `cls-${Date.now()}`,
    code: data.code.toUpperCase(),
    name: data.name,
    level: data.level,
    targetBand: data.targetBand,
    scheduleSummary: data.scheduleSummary,
    room: data.room,
    enrolled: 0,
    capacity: data.capacity,
    attendanceRate: 100,
    averageScore: 7.0,
    currentModule: data.currentModule,
    status: "active",
  };

  store.classrooms.push(newClassroom);
  return newClassroom;
}

export async function updateClassroom(
  id: unknown,
  input: unknown,
): Promise<ClassroomGroup> {
  const validId = validate(idSchema, id);
  const data = validate(updateClassroomSchema, input);
  const store = getRuntimeStore();

  const idx = store.classrooms.findIndex((c) => c.id === validId);
  if (idx === -1) throw new NotFoundError("Classroom", validId);

  const existing = store.classrooms[idx];
  const updated: ClassroomGroup = {
    ...existing,
    code: data.code ? data.code.toUpperCase() : existing.code,
    name: data.name ?? existing.name,
    level: data.level ?? existing.level,
    targetBand: data.targetBand ?? existing.targetBand,
    scheduleSummary: data.scheduleSummary ?? existing.scheduleSummary,
    room: data.room ?? existing.room,
    capacity: data.capacity ?? existing.capacity,
    currentModule: data.currentModule ?? existing.currentModule,
  };

  store.classrooms[idx] = updated;
  return updated;
}

