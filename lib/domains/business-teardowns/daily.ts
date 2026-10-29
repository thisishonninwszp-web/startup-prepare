export function tokyoDate(at:Date):string {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
}
export function businessTeardownsEnabled():boolean {return process.env.BUSINESS_TEARDOWNS_ENABLED==='true';}
