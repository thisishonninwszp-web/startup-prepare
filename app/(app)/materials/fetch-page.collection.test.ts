import {beforeEach,it,expect,vi} from 'vitest';
vi.mock('node:dns/promises',()=>({lookup:vi.fn()}));
import {lookup} from 'node:dns/promises';
import {fetchPublicPage} from './fetch-page';
beforeEach(()=>{vi.mocked(lookup).mockResolvedValue([{address:'93.184.216.34',family:4}] as never);vi.stubGlobal('fetch',vi.fn());});
it('guards every actual redirect hop, outside fetch catch',async()=>{const guard=vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));vi.mocked(fetch).mockResolvedValue(new Response('',{status:302,headers:{location:'/next'}}));await expect(fetchPublicPage('https://north.example',undefined,{beforeRequest:guard})).rejects.toThrow('quota');expect(fetch).toHaveBeenCalledTimes(1);expect(guard).toHaveBeenCalledTimes(2);});
it('never reserves or fetches a private redirect',async()=>{const guard=vi.fn();vi.mocked(fetch).mockResolvedValue(new Response('',{status:302,headers:{location:'https://127.0.0.1/'}}));expect((await fetchPublicPage('https://north.example',undefined,{beforeRequest:guard})).ok).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);expect(guard).toHaveBeenCalledTimes(1);});
it('propagates a foreign-host guard before redirect I/O',async()=>{vi.mocked(fetch).mockResolvedValue(new Response('',{status:302,headers:{location:'https://evil.example/'}}));await expect(fetchPublicPage('https://north.example',undefined,{beforeRequest:async url=>{if(new URL(url).hostname!=='north.example')throw new Error('foreign');}})).rejects.toThrow('foreign');expect(fetch).toHaveBeenCalledTimes(1);});
