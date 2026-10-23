import { z } from "zod";
import { reportSchema } from "./schemas";

const n = z.number().finite();
export const priorities = ["monthly_cost", "schools", "space"] as const;
export const fitRequestSchema = z.object({
  max_price: n.positive().max(100_000_000),
  monthly_budget: n.positive().max(1_000_000).optional(),
  min_beds: n.min(0).max(30).default(0),
  zipcodes: z.array(z.string().regex(/^\d{5}$/)).max(20).default([]),
  home_type: z.enum(["SINGLE_FAMILY", "TOWNHOUSE", "CONDO"]).optional(),
  priorities: z.array(z.enum(priorities)).min(1).max(3).default(["monthly_cost"]),
  stretch_percent: n.min(0).max(20).default(0),
  limit: n.int().min(1).max(30).default(12),
}).strict();
export type FitRequest = z.infer<typeof fitRequestSchema>;
export const fitHomeSchema = z.object({
  zpid: n.int(), address: z.string(), zipcode: z.string(), home_type: z.string(),
  price: n, living_area: n, beds: n, baths: n.nullable(), lat: n.nullable(), lon: n.nullable(),
  school_mean: n.nullable(), costs: reportSchema.shape.costs, monthly_status: z.literal("incomplete"),
  over_budget: n, over_budget_percent: n, score: n, reasons: z.array(z.string()),
});
export type FitHome = z.infer<typeof fitHomeSchema>;
export const fitResponseSchema = z.object({
  within_budget: z.array(fitHomeSchema), stretch: z.array(fitHomeSchema),
  eligible_count: n.int(), within_count: n.int(), stretch_count: n.int(),
  dataset: z.string(), method: z.string(), school_context: z.string(), crime_context: z.string(), assumptions: z.array(z.string()),
});
