import {createHash,randomBytes} from 'node:crypto';
export function tokenDigest(token:string){if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('接入令牌无效');return createHash('sha256').update(token,'utf8').digest('hex');}
export function newProductToken(){const token=randomBytes(32).toString('base64url');return {token,hash:tokenDigest(token)};}
