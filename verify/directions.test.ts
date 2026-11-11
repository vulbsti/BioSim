import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {check,directions} from './directions';
import {OUT} from './report-data';

const results = directions.map(check);
mkdirSync(OUT, {recursive: true});
writeFileSync(`${OUT}/directions.json`, JSON.stringify(results.map(({read, cause, ...r}) => r), null, 1));
for (const r of results) test(`${r.chain}: ${r.claim}`, {skip: r.status === 'pending' ? r.detail : false}, () => assert.equal(r.status, 'pass', r.detail));
