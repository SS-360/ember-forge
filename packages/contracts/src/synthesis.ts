import { z } from "zod";
import { SkillContractSchema, SkillDefinitionSchema } from "./index.js";

export const CandidateDraftSchema = z.object({ skill: SkillDefinitionSchema, contract: SkillContractSchema }).strict();
export const CandidateDraftJsonSchema = z.toJSONSchema(CandidateDraftSchema, { target: "draft-7" });
