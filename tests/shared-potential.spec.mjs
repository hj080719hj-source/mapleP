import {test,expect} from '@playwright/test';

test('hat cooldown and glove critical damage follow selected parts and persist',async({page})=>{
  await page.goto('/?item=arcane&part=6&target=0');
  await page.locator('#stat').selectOption('쿨타임 감소');
  await expect(page.locator('#threshold option')).toHaveText(['1초 이상','2초 이상','3초 이상','4초 이상','5초 이상','6초 이상']);
  await page.locator('#threshold').selectOption('6');
  await expect(page.locator('.goal-tags')).toContainText('쿨타임 감소 6초 이상');
  await page.goto('/');
  await expect(page.locator('#stat')).toHaveValue('쿨타임 감소');
  await expect(page.locator('#threshold')).toHaveValue('6');
  await page.locator('[data-part="11"]').click();
  await expect(page.locator('#stat')).toHaveValue('');
  await expect(page.locator('#stat option[value="쿨타임 감소"]')).toHaveCount(0);
  await page.locator('#stat').selectOption('크리티컬 데미지');
  await expect(page.locator('#threshold option')).toHaveText(['8% 이상','16% 이상','24% 이상']);
  await page.locator('#threshold').selectOption('16');
  await expect(page.locator('.goal-tags')).toContainText('크리티컬 데미지 16% 이상');
  await expect(page.locator('.total')).not.toContainText('NaN');
  await page.locator('[data-part="10"]').click();
  await expect(page.locator('#stat')).toHaveValue('');
  await expect(page.locator('#stat option[value="크리티컬 데미지"]')).toHaveCount(0);
});

test('attack and magic percent choices follow equipment probability tables',async({page})=>{
  await page.goto('/?item=dreamy&target=0');
  await expect(page.locator('#stat option')).toHaveText(['선택 없음','주스탯%','올스탯%']);
  await page.locator('[data-item="destiny"]').click();
  await expect(page.locator('#stat option')).toHaveText(['선택 없음','주스탯%','올스탯%','공격력%','마력%']);
  await page.locator('#stat').selectOption('공격력');
  await expect(page.locator('.goal-tags')).toContainText('공격력');
  await page.locator('[data-item="astra"]').click();
  await expect(page.locator('#stat')).toHaveValue('공격력');
  await page.locator('[data-item="eternal-main"]').click();
  await page.locator('[data-part="14"]').click();
  await expect(page.locator('#stat option')).toHaveText(['선택 없음','주스탯%','올스탯%']);
  await expect(page.locator('#stat')).toHaveValue('');
  await expect(page.locator('.total')).toBeVisible();
  await page.goto('/?item=meister&stat='+encodeURIComponent('마력')+'&target=0');
  await expect(page.locator('#stat')).toHaveValue('');
});

test('all-stat target persists and offers totals appropriate to item level',async({page})=>{
  await page.goto('/?item=dreamy&target=0');
  await page.locator('#stat').selectOption('올스탯');
  await expect(page.locator('#threshold option')).toHaveText(['21% 이상','24% 이상','27% 이상']);
  await expect(page.locator('#potential-rule')).toContainText('개별 옵션은 합산하지 않습니다');
  await expect(page.locator('.goal-tags')).toContainText('올스탯 27% 이상');
  await page.locator('#threshold').selectOption('21');
  await page.goto('/');
  await expect(page.locator('#stat')).toHaveValue('올스탯');
  await expect(page.locator('#threshold')).toHaveValue('21');
  await page.locator('[data-item="eternal-main"]').click();
  await expect(page.locator('#threshold option')).toHaveText(['24% 이상','27% 이상','30% 이상']);
  await expect(page.locator('#threshold')).toHaveValue('27');
  await expect(page.locator('.total')).not.toContainText('NaN');
  await page.locator('#stat').selectOption('주스탯');
  await expect(page.locator('#threshold option')).toHaveText(['27% 이상','30% 이상','33% 이상','36% 이상','39% 이상']);
});
test('shared and class equipment clearly display their distinct success rules',async({page})=>{
  await page.goto('/?item=dreamy&stat=INT&threshold=27');
  await expect(page.locator('#potential-rule')).toContainText('공용 장비:');
  await expect(page.locator('.goal-tags')).toContainText('주스탯 중 하나 27% 이상');
  await expect(page.locator('.total')).toBeVisible();
  await page.locator('[data-item="eternal-main"]').click();
  await expect(page.locator('#potential-rule')).toContainText('선택한 주스탯%만');
  await expect(page.locator('.goal-tags')).toContainText('주스탯 27% 이상');
  await expect(page.locator('.total')).toBeVisible();
  await page.locator('[data-item="arcane"]').click();
  await expect(page.locator('.goal-tags')).toContainText('주스탯 27% 이상');
  await page.locator('[data-item="dreamy"]').click();
  await expect(page.locator('.goal-tags')).toContainText('주스탯 중 하나 27% 이상');
  await page.locator('#stat').selectOption('');
  await expect(page.locator('#upgrade-detail')).toHaveCount(0);
});
