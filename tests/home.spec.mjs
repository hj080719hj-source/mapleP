import {gotoReset} from './navigation.mjs';
import {test,expect} from '@playwright/test';
test('all screenshot equipment is visible with icons and grouped armor changes part',async({page})=>{
  await gotoReset(page,'/?item=dreamy');
  await expect(page.locator('[data-item]')).toHaveCount(26);
  await expect(page.locator('.equipment-row')).toHaveCount(6);
  await expect(page.locator('.equipment-icons i')).toHaveCount(33);
  await page.locator('[data-item="eternal-main"]').click();
  await page.locator('[data-part="9"]').click();
  await expect(page.locator('#part')).toHaveValue('9');
  await expect(page.locator('[data-part="9"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.total')).toBeVisible();
  await page.locator('[data-item="astra"]').click();
  await expect(page.locator('#form-error')).toBeVisible();
  await expect(page.locator('.total')).toHaveCount(0);
  await gotoReset(page,'/potential.html');
  await expect(page.locator('#item')).toHaveValue('astra');
  await expect(page.locator('.total')).toBeVisible();
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-item="meister"]').click();
  await page.locator('.equipment-card').screenshot({path:'artifacts/equipment-selector.png'});
});
test('no starforce target excludes enhancement and recovery and persists',async({page})=>{
  await page.goto('/?item=dreamy&stat=INT');
  await page.locator('[data-target="0"]').click();
  await page.locator('#calculation-details>summary').click();
  await expect(page.locator('#upgrade-cost')).toBeVisible();
  for (const name of ['스타포스 강화','파괴 복구 · 스페어']) {
    await expect(page.locator('.breakdown>div').filter({hasText:name}).locator('dd')).toHaveText('0 메소');
  }
  await expect(page.locator('#recovery-result')).toContainText('비용 제외');
  await page.goto('/');
  await expect(page.locator('#target')).toHaveValue('0');
  await expect(page.locator('#star-label')).toHaveText('선택 없음');
  await page.locator('#stat').selectOption('');
  await page.locator('#purchase').fill('5');
  await page.locator('#purchase').dispatchEvent('change');
  await expect(page.locator('.raw-total')).toContainText('500,000,000 메소');
  await page.locator('[data-target="22"]').click();
  await expect(page.locator('.goal-tags')).toContainText('22성');
  await expect(page.locator('.breakdown>div').filter({hasText:'스타포스 강화'}).locator('dd')).not.toHaveText('0 메소');
});

test('entry opens meister calculator with target selection',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await gotoReset(page,'/');
  await expect(page).toHaveURL('http://127.0.0.1:5173/?recovery=reset');
  await expect(page.locator('#item')).toHaveValue('meister');
  await expect(page.locator('#stat')).toHaveValue('');
  await expect(page.locator('#stat option')).toHaveText(['선택 없음','주스탯%','올스탯%']);
  await expect(page.locator('#threshold option')).toHaveText(['27% 이상','30% 이상','33% 이상','36% 이상','39% 이상']);
  await expect(page.locator('#start-range')).toHaveCount(0);
  await expect(page.locator('[data-target]')).toHaveText(['선택 없음',...Array.from({length:11},(_,i)=>`${i+17}성`)]);
  await expect(page.locator('#target-range')).toHaveCount(0);
  await page.locator('[data-target="25"]').click();
  await expect(page.locator('#target')).toHaveValue('25');
  await expect(page.locator('.goal-tags')).toContainText('25성');
  await expect(page.locator('.total')).not.toContainText('NaN');
  await expect(page.locator('.brand')).toContainText('메이플유');
  await page.screenshot({path:'artifacts/home.png',fullPage:true});
  expect(errors).toEqual([]);
});
