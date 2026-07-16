import { z } from "zod";

export const ageBands = ["under_13", "teen", "adult", "unknown"] as const;
export const signupAgeBands = ["under_13", "teen", "adult"] as const;

export const ageBandSchema = z.enum(ageBands);
export const signupAgeBandSchema = z.enum(signupAgeBands);
export const selfOnboardingAgeBandSchema = z.enum(["teen", "adult"]);

export type AgeBand = z.infer<typeof ageBandSchema>;
