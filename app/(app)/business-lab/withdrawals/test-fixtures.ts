import type {WithdrawalIssuer,WithdrawalLesson,WithdrawalLessonInput} from '@/lib/domains/business-teardowns/withdrawals/domain';
import {withdrawalIdentityKey} from '@/lib/domains/business-teardowns/withdrawals/domain';
// Test-only fixture. Never imported by production pages or inserted into a real queue.
export const issuerId='40000000-0000-4000-8000-000000000001';
export const lessonId='40000000-0000-4000-8000-000000000002';
export const caseId='40000000-0000-4000-8000-000000000003';
const subject={name:'North Service',operator:'North Ltd',market:'Japan',scope:'business' as const};
export const issuer:WithdrawalIssuer={id:issuerId,name:'North Ltd official',domain:'north.example',subjectIdentityKey:withdrawalIdentityKey(subject),createdAt:'2026-11-01T00:00:00Z',confirmedAt:'2026-11-01T00:00:00Z'};
export const lessonInput:WithdrawalLessonInput={subject:{...subject,identityKey:withdrawalIdentityKey(subject)},event:'stop',phase:'announced',announcedOn:'2026-11-01',effectiveOn:'2026-12-01',source:{issuerId,url:'https://north.example/news',text:'North Ltd operates North Service in Japan. The business will stop. Announced on 2026-11-01. Service ends on 2026-12-01. Published on 2026-11-01.',capturedAt:'2026-11-02T00:00:00Z',publishedOn:'2026-11-01'},eventQuote:'The business will stop.',reasonQuote:null,bindings:{subject:'North Ltd operates North Service in Japan.',phase:'The business will stop.',announcedOn:'Announced on 2026-11-01.',effectiveOn:'Service ends on 2026-12-01.',publishedOn:'Published on 2026-11-01.'},offering:null,buyers:null,explanationA:'Costs may have changed.',explanationB:'The operator may have shifted priorities.',distinguishingObservation:'Find public cost history.',unknowns:['No reason is published.']};
export const lesson:WithdrawalLesson={...lessonInput,id:lessonId,caseId,selectedOn:'2026-11-20',source:{...lessonInput.source,contentHash:'a'.repeat(64)},confirmed:true,revision:1,createdAt:'2026-11-02T00:00:00Z',erasedAt:null};
