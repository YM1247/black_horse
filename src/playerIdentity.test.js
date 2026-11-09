import { expect, it } from 'vitest';
import { readIdentityCsv, resolveIdentity, reviewKey } from './playerIdentity';
const row = { realName:'甲',phone:'0912345678',name:'藝名' };
it('核對本名及電話並要求改名裁定', () => {
  const profile = resolveIdentity([],row,'stable');
  expect(resolveIdentity([profile],{...row,phone:'+886 912-345-678'},'other')).toEqual(profile);
  expect(()=>resolveIdentity([profile],{...row,name:'新名'},'other')).toThrow('核對');
  expect(resolveIdentity([profile],{...row,name:'新名'},'other',{id:'stable',key:reviewKey([profile])})).toMatchObject({id:'stable',name:'新名'});
});
it('CSV 保留電話的前導零及引號內的逗號', () => {
  expect(readIdentityCsv('電話號碼,打師名,本名\r\n0912345678,"甲,乙",甲')).toEqual([{...row,name:'甲,乙'}]);
});
