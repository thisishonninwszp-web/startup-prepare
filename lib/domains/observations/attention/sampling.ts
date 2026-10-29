export function isFixedSample(ordinal:number,everyNth:number):boolean {
 if(!Number.isSafeInteger(ordinal)||ordinal<1||!Number.isSafeInteger(everyNth)||everyNth<1)throw new Error('Invalid sampling rule');
 return (ordinal-1)%everyNth===0;
}
