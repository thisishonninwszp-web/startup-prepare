import {z} from 'zod';
import {withdrawalUuid,withdrawalStamp,withdrawalIssuerSchema,safeOfficialUrl,type WithdrawalIssuer} from '../domain';
import {cashDate} from '../../cash/domain';
export const COLLECTION_POLICY='official-withdrawal-public-text-v1' as const;
export const COLLECTION_VALIDATOR='withdrawal-collection-v1';
export const COLLECTION_LIMITS=Object.freeze({search:2,page:3,ai:1});
export const collectionCandidateReceiptSchema=z.union([z.object({status:z.literal('saved'),id:withdrawalUuid,revision:z.literal(1)}).strict(),z.object({status:z.literal('duplicate'),identityKey:z.string().min(1).max(1000)}).strict()]);
const revision=z.number().int().min(0).max(2147483646);
export const collectionSettingsSchema=z.object({enabled:z.boolean(),issuerIds:z.array(withdrawalUuid).max(20).refine(v=>new Set(v).size===v.length),publicTextConfirmed:z.boolean(),policyVersion:z.literal(COLLECTION_POLICY),revision}).strict();
export const collectionSettingsInputSchema=collectionSettingsSchema.omit({revision:true}).extend({expectedRevision:revision,requestId:withdrawalUuid}).strict().refine(v=>!v.enabled||(v.publicTextConfirmed&&v.issuerIds.length>0),'启用前需确认额外预算和公开正文范围');
export type CollectionSettingsInput=z.infer<typeof collectionSettingsInputSchema>;
export const DEFAULT_COLLECTION_SETTINGS={enabled:false,issuerIds:[],publicTextConfirmed:false,policyVersion:COLLECTION_POLICY,revision:0};
export const runStatus=z.enum(['running','completed','failed','unknown']);
export const collectionRunSchema=z.object({id:withdrawalUuid,localDate:cashDate,status:runStatus,revision:revision.min(1),expiresAt:withdrawalStamp}).strict();
export const collectionLeaseSchema=collectionRunSchema.extend({token:withdrawalUuid,issuers:z.array(withdrawalIssuerSchema).min(1).max(20)}).strict();
export type CollectionLease=z.infer<typeof collectionLeaseSchema>;
export const attemptSchema=z.object({id:withdrawalUuid,kind:z.enum(['search','page','ai']),status:z.enum(['reserved','completed','failed','unknown']),createdAt:withdrawalStamp}).strict();
export const diagnosticSchema=z.object({id:withdrawalUuid,validatorVersion:z.literal(COLLECTION_VALIDATOR),issues:z.array(z.enum(['invalid_json','invalid_candidate','invalid_analysis','source_mismatch','unrecognized_subject','page_unavailable','collection_failed'])).max(30),truncated:z.boolean(),createdAt:withdrawalStamp}).strict();
export const collectionStateSchema=z.object({available:z.boolean(),settings:collectionSettingsSchema,run:collectionRunSchema.nullable(),attempts:z.array(attemptSchema).max(6),diagnostics:z.array(diagnosticSchema).max(20)}).strict();
export type CollectionState=z.infer<typeof collectionStateSchema>;
export type CollectionIssue=z.infer<typeof diagnosticSchema>['issues'][number];
export function registeredPage(url:string,issuer:WithdrawalIssuer):boolean{return safeOfficialUrl.safeParse(url).success&&new URL(url).hostname===issuer.domain;}
export function collectionQuery(issuer:WithdrawalIssuer):string{const parts=issuer.subjectIdentityKey.split('|');if(parts.length!==4)throw new Error('已确认主体标识无效');const quote=(v:string)=>`"${v.replace(/["\\\r\n]/g,' ')}"`;return `site:${issuer.domain} ${quote(issuer.name)} ${quote(parts[0])} ${quote(parts[3])} 撤退 縮小 終了 閉店`;}
