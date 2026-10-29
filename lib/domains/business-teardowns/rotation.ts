import type {RotationDimensions} from './rules';
const dimensions=['category','priceBand','businessModel'] as const;
/** Lexicographic least-recent use; dimensions are not combined into a rating. */
export function compareRotation(a:RotationDimensions,b:RotationDimensions,recent:RotationDimensions[]):number {
 for(const key of dimensions){const ai=recent.findIndex(row=>row[key]===a[key]),bi=recent.findIndex(row=>row[key]===b[key]);const order=(bi<0?Number.MAX_SAFE_INTEGER:bi)-(ai<0?Number.MAX_SAFE_INTEGER:ai);if(order)return order;}
 return 0;
}
