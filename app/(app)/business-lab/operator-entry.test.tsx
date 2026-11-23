import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {BusinessOperatorEntry} from './operator-entry';
it('offers explanation comparison and withdrawal lessons inside business lab',()=>{const html=renderToStaticMarkup(<BusinessOperatorEntry caseId="owned-case"/>);expect(html).toContain('/business-lab/explanations?caseId=owned-case');expect(html).toContain('/business-lab/withdrawals');});
