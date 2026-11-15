import {z} from 'zod';
export const uuidSchema=z.string().uuid();
const text=z.string().trim().min(1).max(3000);
export const targetKindSchema=z.enum(['idea','business_case','method']);
const base={requestId:uuidSchema,id:uuidSchema,expectedRevision:z.number().int().min(0).max(2147483646)};
export const commandSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('save'),text,invalidWhen:text,keywords:z.array(z.string().trim().min(1).max(80)).min(1).max(12)}).strict(),
 z.object({...base,operation:z.literal('erase')}).strict(),
 z.object({...base,operation:z.literal('link'),targetKind:targetKindSchema,targetId:uuidSchema,rationale:text}).strict(),
 z.object({...base,operation:z.literal('unlink'),linkId:uuidSchema}).strict(),
 z.object({...base,operation:z.literal('review'),newsId:uuidSchema,effect:text}).strict(),
]);
export type PremiseCommand=z.infer<typeof commandSchema>;
export const readSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('list'),before:uuidSchema.optional()}).strict(),
 z.object({operation:z.literal('get'),id:uuidSchema}).strict(),
 z.object({operation:z.literal('targets'),targetKind:targetKindSchema,before:uuidSchema.optional()}).strict(),
 z.object({operation:z.literal('news'),id:uuidSchema,before:uuidSchema.optional()}).strict(),
 z.object({operation:z.literal('history'),id:uuidSchema,before:uuidSchema.optional()}).strict(),
]);
export type PremiseRead=z.infer<typeof readSchema>;
export const resultSchema=z.object({id:uuidSchema,revision:z.number().int().positive(),operation:z.enum(['save','erase','link','unlink','review'])}).strict();
export const premiseSchema=z.object({id:uuidSchema,text,invalidWhen:text,keywords:z.array(z.string()),revision:z.number().int().positive(),createdAt:z.string()}).strict();
export const targetSchema=z.object({id:uuidSchema,kind:targetKindSchema,title:z.string().nullable(),href:z.string().nullable(),available:z.boolean()}).strict();
export const linkSchema=z.object({id:uuidSchema,rationale:text,target:targetSchema}).strict();
export const newsSchema=z.object({id:uuidSchema,title:z.string().nullable(),summary:z.string().nullable(),available:z.boolean(),fetchedAt:z.string().nullable()}).strict();
export const reviewSchema=z.object({id:uuidSchema,effect:text,createdAt:z.string(),news:newsSchema,premiseText:text,premiseInvalidWhen:text,premiseRevision:z.number().int().positive()}).strict();
export const pageSchema=z.object({available:z.boolean(),items:z.array(premiseSchema),nextCursor:uuidSchema.nullable()}).strict();
export const detailSchema=z.object({premise:premiseSchema,links:z.array(linkSchema)}).strict().nullable();
export const targetPageSchema=z.object({available:z.boolean(),items:z.array(targetSchema),nextCursor:uuidSchema.nullable()}).strict();
export const candidateSchema=newsSchema.extend({lastReviewedAt:z.string().nullable()});
export const newsPageSchema=z.object({available:z.boolean(),items:z.array(candidateSchema),nextCursor:uuidSchema.nullable()}).strict();
export const historyPageSchema=z.object({available:z.boolean(),items:z.array(reviewSchema),nextCursor:uuidSchema.nullable()}).strict();
export type Premise=z.infer<typeof premiseSchema>;
export type PremiseDetail=NonNullable<z.infer<typeof detailSchema>>;
export type PremisePage=z.infer<typeof pageSchema>;
export type TargetPage=z.infer<typeof targetPageSchema>;
export type NewsPage=z.infer<typeof newsPageSchema>;
export type HistoryPage=z.infer<typeof historyPageSchema>;
