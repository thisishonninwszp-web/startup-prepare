import {admissible,merchantKey,RULE_VERSION,type QueuedCandidate,type SelectionHistory} from './rules';
import {compareRotation} from './rotation';
export function selectCandidate(candidates:QueuedCandidate[],history:SelectionHistory):{candidate:QueuedCandidate;ruleVersion:string;reason:string}|null {
 const excluded=new Set([...history.excluded,...history.priorMain]);
 const ordered=candidates.filter(c=>admissible(c)&&!excluded.has(merchantKey(c))).sort((a,b)=>compareRotation(a,b,history.recent)||merchantKey(a).localeCompare(merchantKey(b),'en')||a.itemCode.localeCompare(b.itemCode,'en'));
 if(!ordered.length)return null;
 return {candidate:ordered[0],ruleVersion:RULE_VERSION,reason:`准入后按类别、价位、经营方式最近使用次序轮换；同序按平台店铺及商品身份确定。规则 ${RULE_VERSION}。`};
}
