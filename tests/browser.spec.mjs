import {gotoReset} from './navigation.mjs';
import { test, expect } from '@playwright/test';

test('default example, live updates, errors and page persistence', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await gotoReset(page,'/?item=dreamy');
  await expect(page.locator('.result-card h2')).toHaveText('몽환의 벨트');
  await expect(page.locator('.total')).not.toContainText('NaN');
  await expect(page.locator('.goal-tags')).toContainText('잠재 선택 없음');
  await page.locator('[data-event="none"]').click();
  const before = await page.locator('.total').textContent();
  await expect(page.locator('#spare, .equipment-custom')).toHaveCount(0);
  await page.locator('#purchase').fill('5');
  await page.getByRole('button',{name:'기대 비용 계산하기'}).click();
  await expect(page.locator('.total')).not.toHaveText(before);
  await page.locator('[data-target="18"]').click();
  await expect(page.locator('.total')).not.toHaveText(before);
  await gotoReset(page,'/potential.html');

  await expect(page.locator('#target')).toHaveCount(0);
  await expect(page.locator('.goal-tags')).toContainText('잠재 선택 없음');
  await gotoReset(page,'/starforce.html');
  await expect(page.locator('#stat')).toHaveCount(0);
  await expect(page.locator('#target')).toHaveValue('18');
  await page.locator('[data-event="none"]').click();
  await gotoReset(page,'/guide.html');
  await expect(page.getByRole('heading',{name:'지원 범위'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('equipment, custom fields, manual costs and preserve recovery', async ({page}) => {
  await gotoReset(page,'/?item=dreamy');
  await page.locator('[data-item="clover"]').click();
  await expect(page.locator('.result-card h2')).toHaveText('골든 클로버 벨트');
  await page.locator('#recovery').selectOption('preserve');
  await expect(page.locator('.total')).toBeVisible();
  await page.locator('#recovery-cost-details summary').click();
  for(const input of await page.locator('[data-recovery]').all()) await input.fill('100000000');
  await page.getByRole('button',{name:'기대 비용 계산하기'}).click();
  await expect(page.locator('.total')).toBeVisible();
  await page.locator('#cost-details summary').click();
  for(const input of await page.locator('[data-cost]').all()) await input.fill('100');
  await page.locator('[data-cost]').last().dispatchEvent('change');
  await page.getByRole('button',{name:'기대 비용 계산하기'}).click();
  await expect(page.locator('.result-badge')).toHaveText('입력 비용 기준');
  await page.getByRole('button',{name:'초기화',exact:true}).click();
  await expect(page.locator('#item')).toHaveValue('dreamy');
  await expect(page.locator('#spare')).toHaveCount(0);
});

test('reference-style equipment buttons, sliders, events and detailed table stay in sync', async ({page}) => {
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  await gotoReset(page,'/starforce.html');
  await page.getByRole('button',{name:'마이스터링',exact:true}).click();
  await expect(page.locator('.result-card h2')).toHaveText('마이스터링');
  await expect(page.locator('[data-item="meister"]')).toHaveAttribute('aria-pressed','true');
  // Compare the star-only table with the total without initial purchase cost.
  await page.locator('#purchase').fill('0');
  await page.locator('#purchase').dispatchEvent('change');
  await expect(page.locator('#start-range, #start')).toHaveCount(0);
  await page.locator('[data-target="18"]').click();
  await expect(page.locator('#target')).toHaveValue('18');
  const before = await page.locator('.total').textContent();
  await page.getByRole('button',{name:'이벤트 없음',exact:true}).click();
  await expect(page.locator('.total')).not.toHaveText(before);
  await page.getByRole('button',{name:'샤이닝',exact:true}).click();
  await expect(page.locator('[data-event="shining"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.total')).toHaveText(before);
  await page.getByRole('button',{name:'다이아 이상 10%'}).click();
  await expect(page.locator('[data-mvp="0.1"]')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('checkbox',{name:'5% 추가 할인'}).check();
  await page.locator('[data-guard="17"]').click();
  await expect(page.locator('[data-guard="17"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#autoSafeguard')).not.toBeChecked();
  await page.locator('#stages summary').click();
  await expect(page.locator('#stage-rows tr')).toHaveCount(18);
  const finalCost = await page.locator('#stage-rows tr').last().locator('td').nth(2).textContent();
  await expect(page.locator('.total')).toContainText(finalCost);
  await page.getByRole('button',{name:'샤이닝 + 5·10·15성 확정'}).click();
  await expect(page.locator('[data-guard="15"]')).toBeDisabled();
  await page.reload();
  await expect(page.locator('[data-event="shining-guarantee"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#pcBang')).toBeChecked();
  expect(errors).toEqual([]);
});

test('desktop and mobile layout render without horizontal overflow', async ({page}) => {
  await page.setViewportSize({width:1440,height:1050});
  await gotoReset(page,'/?item=dreamy');
  await expect(page.locator('.total')).toBeVisible();
  await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  for (const path of ['/?item=dreamy', '/potential.html','/starforce.html','/guide.html']) {
    await gotoReset(page,path);
    await expect(page.locator('#content .card').first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await gotoReset(page,'/?item=dreamy');
  await expect(page.locator('.total')).toBeVisible();
  await page.screenshot({path:'artifacts/mobile.png',fullPage:true});
});

test('unavailable probability data shows a readable error', async ({page}) => {
  await page.route('**/data/potential.json', route=>route.fulfill({status:503,body:'unavailable'}));
  await gotoReset(page,'/?item=dreamy');
  await expect(page.getByRole('alert')).toContainText('확률 데이터');
  await expect(page.locator('.total')).toHaveCount(0);
});
