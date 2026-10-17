import test from 'node:test';
import assert from 'node:assert/strict';
import {euro,num} from './format.mjs';

test('Spanish money groups four-digit amounts with dots and uses decimal commas',()=>{
 assert.equal(euro(3000).replace(/\s/g,' '),'3.000 €');
 assert.equal(euro(1430.06,2).replace(/\s/g,' '),'1.430,06 €');
 assert.equal(euro(175000).replace(/\s/g,' '),'175.000 €');
 assert.equal(euro(-1234.5,2).replace(/\s/g,' '),'-1.234,50 €');
 assert.equal(num(1000.5),'1.000,5');
 for(const value of [null,undefined,NaN,Infinity])assert.equal(euro(value),'Pendiente');
});
