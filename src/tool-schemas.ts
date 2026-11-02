import { z } from "zod";

export const getFileArgsSchema = z.object({
  path: z.string().trim().min(1),
}).strict();

export const writeFileArgsSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
}).strict();

export const appendFileArgsSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
}).strict();

export const deleteFileArgsSchema = z.object({
  path: z.string().trim().min(1),
}).strict();

export const searchVaultArgsSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

export const listFilesArgsSchema = z.object({
  directory: z.string().trim().optional(),
}).strict();

export const getLinkedNotesArgsSchema = z.object({
  path: z.string().trim().min(1),
  direction: z.enum(["incoming", "outgoing", "both"]).optional(),
  depth: z.number().int().min(1).max(3).optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();
