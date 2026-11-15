import {expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./actions',()=>({}));
import {PremisesPanel} from './panel';
it('gives module-specific migration guidance and does not advertise a working empty library',()=>{const html=renderToStaticMarkup(<PremisesPanel initialPage={{available:false,items:[],nextCursor:null}}/>);expect(html).toContain('125');expect(html).not.toContain('新建前提');});
it('explains human review and gives a complete premise capture form',()=>{const html=renderToStaticMarkup(<PremisesPanel initialPage={{available:true,items:[],nextCursor:null}}/>);for(const text of ['新建前提','什么现象会让它失效','关键词','不代表前提已经改变'])expect(html).toContain(text);});
