import {z} from 'zod';
export const attentionUuid=z.string().uuid();
const text=z.string().trim().min(1).max(4000);
export const attentionKinds=['contract','contract_exit','register','review','blind_start','blind_judge','blind_exit','blind_reveal'] as const;
export type AttentionKind=typeof attentionKinds[number];
export interface AttentionWriteInput {kind:AttentionKind;requestId:string;versionId?:string|null;payload:Record<string,unknown>}
export interface AttentionEntry {id:string;revision:string;event_id:string;kind:AttentionKind;version_id:string|null;payload:Record<string,unknown>;created_at:string}
export interface AttentionPage {available:boolean;entries:AttentionEntry[];nextCursor:string|null}
const schemas={
 contract:z.object({triggers:text,counterevidence:text,everyNth:z.number().int().min(1).max(1000)}).strict(),
 contract_exit:z.object({}).strict(),
 register:z.object({snapshotId:attentionUuid,choice:z.enum(['seen','open','skip','pending']),contractMatch:z.enum(['matched','not_matched','unknown']).default('unknown'),matchReason:z.string().trim().max(4000).optional()}).strict(),
 review:z.object({registrationId:attentionUuid,note:text}).strict(),
 blind_start:z.object({registrationId:attentionUuid}).strict(),
 blind_judge:z.object({sessionId:attentionUuid,judgment:text}).strict(),
 blind_exit:z.object({sessionId:attentionUuid}).strict(),
 blind_reveal:z.object({sessionId:attentionUuid}).strict(),
};
export function normalizeAttention(kind:AttentionKind,payload:unknown):Record<string,unknown>{return schemas[z.enum(attentionKinds).parse(kind)].parse(payload);}
export function parseAttentionCursor(value?:string|null):string|null {if(value===null||value===undefined)return null;if(!/^[1-9][0-9]*$/.test(value)||BigInt(value)>BigInt('9223372036854775807'))throw new Error('无效分页位置');return value;}


