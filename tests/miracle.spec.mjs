import {gotoReset} from './navigation.mjs';
import {test,expect} from '@playwright/test';

test('starting potential grade changes remaining upgrade costs and persists',async({page})=>{
  await page.goto('/?item=dreamy&stat=INT&target=0');
  const grade=page.locator('.option-card #potentialGrade');
  await expect(grade).toHaveValue('epic');
  await grade.selectOption('unique');
  await expect(page.locator('#upgrade-detail')).toContainText('유니크 → 레전드리');
  await expect(page.locator('#upgrade-detail')).not.toContainText('에픽 → 유니크');
  await grade.selectOption('legendary');
  await expect(page.locator('#upgrade-detail')).toHaveCount(0);
  await expect(page.locator('.breakdown>div').filter({hasText:'잠재 등업'}).locator('dd')).toHaveText('0 메소');
  await expect(page.locator('.total')).not.toContainText('NaN');
  await page.goto('/');
  await expect(grade).toHaveValue('legendary');
  await grade.selectOption('rare');
  await expect(page.locator('#upgrade-detail')).toContainText('레어 → 에픽');
  await page.goto('/potential.html');
  await expect(page.locator('#potentialGrade')).toHaveValue('rare');
});
test('miracle changes grade costs, keeps option cost and persists',async({page})=>{
  await gotoReset(page,'/?item=dreamy&stat=INT&threshold=27');
  await page.locator('#miracle').uncheck();
  await expect(page.locator('#upgrade-detail')).toContainText('3.5%');
  const normal=await page.locator('#upgrade-cost').textContent();
  const optionCost=await page.locator('.breakdown>div').filter({hasText:'잠재 옵션 재설정'}).textContent();
  await page.getByRole('checkbox',{name:'미라클타임 적용',exact:true}).check();
  await expect(page.locator('#upgrade-detail')).toContainText('7%');
  await expect(page.locator('#upgrade-detail')).toContainText('2.8%');
  await expect(page.locator('#upgrade-cost')).not.toHaveText(normal);
  await expect(page.locator('.breakdown>div').filter({hasText:'잠재 옵션 재설정'})).toHaveText(optionCost);
  await gotoReset(page,'/');
  await expect(page.locator('#miracle')).toBeChecked();
  await page.locator('#stat').selectOption('');
  await expect(page.locator('#upgrade-detail')).toHaveCount(0);
  await expect(page.locator('.total')).toBeVisible();
});
