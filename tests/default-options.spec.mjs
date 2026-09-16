import {test,expect} from '@playwright/test';
test('new defaults apply once to saved settings and later edits persist',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>localStorage.setItem('maple-lab:v1',JSON.stringify({item:'dreamy',level:200,part:13,stat:'',threshold:27,target:22,miracle:false,additionalMiracle:false,additionalGrade:'epic',mvp:0,pcBang:false,discount:false,destroyDiscount:false,recoveryDiscount:false,autoSafeguard:false})));
  await page.reload();
  for(const id of ['miracle','pcBang','autoSafeguard'])await expect(page.locator('#'+id)).toBeChecked();
  await expect(page.locator('#additionalGrade')).toHaveValue('rare');
  await expect(page.locator('[data-event="shining"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-mvp="0.1"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.potential-events #miracle')).toHaveCount(1);
  await expect(page.locator('.potential-events #additionalMiracle')).toHaveCount(0);
  await page.locator('#miracle').uncheck();
  await page.locator('#pcBang').uncheck();
  await page.reload();
  await expect(page.locator('#miracle')).not.toBeChecked();
  await expect(page.locator('#pcBang')).not.toBeChecked();
  await page.locator('#reset').click();
  await expect(page.locator('#miracle')).toBeChecked();
  await expect(page.locator('#pcBang')).toBeChecked();
  await expect(page.locator('#additionalGrade')).toHaveValue('rare');
});
test('one miracle switch controls both costs and new star targets persist',async({page})=>{
  await page.goto('/?item=dreamy&stat=INT');
  await page.locator('#additionalStat').selectOption('주스탯');
  await expect(page.locator('.potential-events input[type="checkbox"]')).toHaveCount(1);
  const main=await page.locator('#upgrade-cost').textContent();
  const additional=await page.locator('#additional-upgrade-cost').textContent();
  await page.locator('#miracle').uncheck();
  await expect(page.locator('#upgrade-cost')).not.toHaveText(main);
  await expect(page.locator('#additional-upgrade-cost')).not.toHaveText(additional);
  for (const star of [17,26,27]){
    await page.locator(`[data-target="${star}"]`).click();
    await expect(page.locator('#target')).toHaveValue(String(star));
    await expect(page.locator('#form-error')).toBeHidden();
    await expect(page.locator('.total')).not.toContainText('NaN');
  }
  await page.goto('/');
  await expect(page.locator('#target')).toHaveValue('27');
  await expect(page.locator('#miracle')).not.toBeChecked();
});
