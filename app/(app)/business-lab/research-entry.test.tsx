import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {BusinessResearchEntry} from './research-entry';
const id='10000000-0000-4000-8000-000000000001';
it('offers each workflow directly from a daily case with the selected case preserved',()=>{
 const html=renderToStaticMarkup(<BusinessResearchEntry caseId={id}/>);
 for(const kind of ['failure','comparison','tension','apprenticeship'])expect(html).toContain(`caseId=${id}&amp;kind=${kind}`);
 expect(html).toContain('带着案例和出处继续');
});
