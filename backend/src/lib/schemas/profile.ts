import { z } from "zod";

export const enterpriseInputSchema = z.object({
  rawCompanyDescription: z.string().min(1, "企业介绍不能为空"),
  companyName: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  techDomains: z.array(z.string().min(1)).optional(),
  developmentNeeds: z.string().min(1).optional(),
});

export type EnterpriseInput = z.infer<typeof enterpriseInputSchema>;

export const profileItemSchema = z.object({
  id: z.string().min(1),
  value: z.string().min(1),
  origin: z.enum(["explicit", "inferred"]),
  confidence: z.enum(["high", "medium", "low"]),
});

export type ProfileItem = z.infer<typeof profileItemSchema>;

/**
 * 五维画像为当前技术基线草案。字段保持可扩展，不作为不可修改的最终产品冻结。
 */
export const enterpriseProfileSchema = z
  .object({
    companyPositioning: z.array(profileItemSchema),
    technologyAndInnovation: z.array(profileItemSchema),
    productsAndApplications: z.array(profileItemSchema),
    industryAndMarket: z.array(profileItemSchema),
    valueCreation: z.array(profileItemSchema),
  })
  .passthrough();

export type EnterpriseProfile = z.infer<typeof enterpriseProfileSchema>;

export const generateProfileRequestSchema = z.object({
  rawCompanyDescription: z.string().min(1, "企业介绍不能为空"),
  companyName: z.string().min(1).optional(),
  industry: z.string().min(1).optional(),
  techDomains: z.array(z.string().min(1)).optional(),
  developmentNeeds: z.string().min(1).optional(),
});
