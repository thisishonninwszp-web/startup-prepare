import {z} from 'zod';
export const workspaceUuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).toLowerCase();
export const workspaceKind=z.enum(['pressure','cash','practice','counterexample','learning','lesson','boundary','simulation','reality_check']);
export const workspaceStamp=z.string().max(80).regex(/^\d{4}-\d\d-\d\dT[0-9:.]+(Z|[+-][0-9]{2}:[0-9]{2})$/).refine(v=>Number.isFinite(Date.parse(v)));
export const workspaceCursorSchema=z.object({date:workspaceStamp,kind:workspaceKind,id:workspaceUuid}).strict();
export const workspaceItemSchema=z.object({kind:workspaceKind,id:workspaceUuid,caseId:workspaceUuid,caseTitle:z.string().max(300),revision:z.number().int().positive(),updatedAt:workspaceStamp,title:z.string().max(160),excerpt:z.string().max(400),nextCheck:z.string().max(400).nullable(),sourceAvailable:z.boolean()}).strict();
export type WorkspaceItem=z.infer<typeof workspaceItemSchema>;
export type WorkspaceState={available:boolean;items:WorkspaceItem[];nextCursor:string|null};
export const workspaceQuerySchema=z.object({before:z.string().max(500).regex(/^[A-Za-z0-9_-]+$/).optional()}).strict();
export function workspaceStart(query:{recordId?:unknown;caseId?:unknown}){return z.object({recordId:workspaceUuid.optional(),caseId:workspaceUuid.optional()}).strict().parse({...(query.recordId!==undefined?{recordId:query.recordId}:{}),...(query.caseId!==undefined?{caseId:query.caseId}:{})});}
export function workspaceHref(input:Pick<WorkspaceItem,'kind'|'id'|'caseId'>){const {kind,id,caseId}=z.object({kind:workspaceKind,id:workspaceUuid,caseId:workspaceUuid}).strict().parse({kind:input.kind,id:input.id,caseId:input.caseId});if(kind==='learning'||kind==='lesson')return `/business-lab/counterexamples?caseId=${caseId}&methodId=${id}&methodKind=${kind}`;const path={pressure:'pressure',cash:'cash',practice:'practice',counterexample:'counterexamples',boundary:'cash/boundaries',simulation:'simulation',reality_check:'simulation/checks'}[kind];return `/business-lab/${path}?caseId=${caseId}&recordId=${id}`;}
export const WORKSPACE_LABELS:Record<WorkspaceItem['kind'],string>={pressure:'条件变化回答',cash:'本人现金假设',practice:'制作课题与成果',counterexample:'反例研究（方法需另行确认）',learning:'已确认的本人方法',lesson:'已确认的本人方法',boundary:'现金假设的边界',simulation:'经营取舍模拟',reality_check:'现实核对计划'};
