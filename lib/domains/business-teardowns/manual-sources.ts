import {requiredText} from './domain';
import {buildManualMaterial,type ManualMaterialInput} from './providers/manual';
import type {AccessStatus} from './learning-domain';
import {tokyoDate} from './daily';
export type DatedManualSourceInput=ManualMaterialInput&{dateSeen:string;accessStatus:AccessStatus;deidentified:boolean;gaps:string};
export function buildDatedManualSource(input:DatedManualSourceInput){
 if(typeof input.dateSeen!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.dateSeen)||!Number.isFinite(Date.parse(input.dateSeen))||new Date(input.dateSeen).toISOString().slice(0,10)!==input.dateSeen||input.dateSeen>tokyoDate(new Date()))throw new Error('请填写实际看见材料的日期，不可填写未来日期');
 if(!['public','partial','login_required','unavailable'].includes(input.accessStatus)||input.deidentified!==true)throw new Error('请确认可见范围并移除个人身份信息');
 requiredText(input.gaps,3000);
 const inaccessible=input.accessStatus==='login_required'||input.accessStatus==='unavailable';
 if(inaccessible&&input.capturedText!=='')throw new Error('访问不可用时只记录缺口，请勿附带未经本次核对的正文');
 const result=buildManualMaterial(input,{allowEmptyExcerpt:inaccessible});
 return {...result,snapshot:{...result.snapshot,structured:{...result.snapshot.structured,dateSeen:input.dateSeen,accessStatus:input.accessStatus,gaps:input.gaps,deidentified:true},coverage:`${input.coverage}；可见状态：${input.accessStatus}；缺口：${input.gaps}`}};
}
