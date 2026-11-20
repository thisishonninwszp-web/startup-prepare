import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {BusinessOperatorEntry} from './operator-entry';
it('opens history and methods within the current case without new global navigation',()=>{
 const html=renderToStaticMarkup(<BusinessOperatorEntry caseId="10000000-0000-4000-8000-000000000001"/>);
 expect(html).toContain('/business-lab/history?caseId=10000000-0000-4000-8000-000000000001');
 expect(html).toContain('/business-lab/methods?caseId=10000000-0000-4000-8000-000000000001');
});
