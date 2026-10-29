import { describe,it,expect } from 'vitest';
import { normalizeIdentity, normalizeActivity, isMissingCompanySchema } from './domain';
describe('company observations boundary',()=>{
 it('requires identity provenance and retains exact captured whitespace',()=>{
 const source={kind:'manual_import',url:'https://example.com',rawText:'  actual name\n',quote:'actual name',scope:'one record'};
 expect(normalizeIdentity({corporateNumber:'1234567890123',legalName:'Name',address:'Tokyo',source}).source.rawText).toBe(source.rawText);
 expect(()=>normalizeIdentity({corporateNumber:'123',legalName:'Name',address:'Tokyo',source})).toThrow();
 expect(()=>normalizeIdentity({corporateNumber:'1234567890123',legalName:'Name',address:'Tokyo',source:{...source,kind:'provider_verified'}})).toThrow();
 });
 it('does not accept invented quote or missing date declaration',()=>{
 const value={type:'procurement',stage:'announcement',title:'Notice',occurredOn:null,dateUnknown:true,source:{kind:'manual_import',url:null,rawText:'原文',quote:'原文',scope:'one notice'},details:{amount:0,currency:'JPY'}};
 expect(normalizeActivity(value).details).toEqual({amount:0,currency:'JPY'});
 expect(()=>normalizeActivity({...value,source:{...value.source,quote:'not in source'}})).toThrow();
 expect(()=>normalizeActivity({...value,dateUnknown:false})).toThrow();
 });
 it('only hides missing owned schema errors',()=>{expect(isMissingCompanySchema({code:'42P01',message:'relation company_observation_entries does not exist'})).toBe(true);expect(isMissingCompanySchema({code:'42501',message:'denied'})).toBe(false);});
});
it('accepts only server-supplied stable request proofs',()=>{const identity={corporateNumber:'1234567890123',legalName:'Name',address:'Tokyo',source:{kind:'manual_import',url:null,rawText:'original',quote:'original',scope:'one',requestProof:'a'.repeat(64)}};expect(()=>normalizeIdentity(identity)).toThrow();expect(normalizeIdentity(identity,true).source).toHaveProperty('requestProof','a'.repeat(64));expect(()=>normalizeIdentity({...identity,source:{...identity.source,requestProof:'wrong'}},true)).toThrow();});

it('rejects source credential URLs and control characters',()=>{const identity={corporateNumber:'1234567890123',legalName:'Name',address:'Tokyo',source:{kind:'manual_import',url:'https://user:secret@example.com/doc',rawText:'original',quote:'original',scope:'one'}};expect(()=>normalizeIdentity(identity)).toThrow();expect(()=>normalizeIdentity({...identity,source:{...identity.source,url:'https://example.com/\npath'}})).toThrow();});
