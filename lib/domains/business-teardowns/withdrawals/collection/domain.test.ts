import {describe,it,expect} from 'vitest';
import {collectionSettingsInputSchema,COLLECTION_POLICY,collectionStateSchema,registeredPage,collectionQuery} from './domain';
const id='10000000-0000-4000-8000-000000000001';
const issuer={id,name:'North official',domain:'north.example',subjectIdentityKey:'north ltd|japan|business|north service',createdAt:'2026-11-01T00:00:00Z',confirmedAt:'2026-11-01T00:00:00Z'};
describe('separate collection consent',()=>{
 it('requires literal policy, public text consent, revision and owned IDs',()=>{const input={enabled:true,issuerIds:[id],publicTextConfirmed:true,policyVersion:COLLECTION_POLICY,expectedRevision:0,requestId:id};expect(collectionSettingsInputSchema.safeParse(input).success).toBe(true);for(const patch of [{publicTextConfirmed:false},{policyVersion:'official-rakuten-scalars-v1'},{issuerIds:[]},{issuerIds:[id,id]},{httpBudget:99},{expectedRevision:-1}])expect(collectionSettingsInputSchema.safeParse({...input,...patch}).success).toBe(false);});
 it('rejects malformed diagnostic DTOs rather than exposing unknown raw text',()=>{expect(collectionStateSchema.safeParse({available:true,settings:{},attempts:[{raw:'invalid prose'}]}).success).toBe(false);});
 it('accepts exact registered HTTPS host and query uses known issuer and subject only',()=>{expect(registeredPage('https://north.example/news',issuer)).toBe(true);for(const url of ['https://evil.example/','https://north.example.evil.example/','http://north.example/','https://north.example:443/news','https://north.example/%0a'])expect(registeredPage(url,issuer)).toBe(false);expect(collectionQuery(issuer)).toContain('"north service"');expect(collectionQuery(issuer)).toContain('site:north.example');});
});
