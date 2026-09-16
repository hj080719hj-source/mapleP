import {test,expect} from '@playwright/test';
test('auto simulation completes and changing settings clears the previous result',async({page})=>{
  await page.addInitScript(()=>{Math.random=()=>0;});
  await page.goto('/?item=dreamy&stat=INT&target=18');
  await page.locator('.simulation-card>summary').click();
  await page.locator('#simulate-start').click();
  await expect(page.locator('#simulation-status')).toContainText('목표 달성!');
  await expect(page.locator('#simulation-output')).toContainText('18성');
  await expect(page.locator('#simulation-output')).toContainText('목표 달성 잠재');
  await expect(page.locator('#simulation-output')).not.toContainText('NaN');
  await page.locator('#purchase').fill('10');
  await expect(page.locator('#simulation-output')).toBeEmpty();
  await expect(page.locator('#simulate-start')).toBeEnabled();
});
test('long simulation can be stopped and reports an unfinished result',async({page})=>{
  await page.addInitScript(()=>{Math.random=()=>.999999;});
  await page.goto('/?item=dreamy&stat=INT&target=0');
  await page.locator('.simulation-card>summary').click();
  await page.locator('#simulate-start').click();
  await page.locator('#simulate-stop').click();
  await expect(page.locator('#simulation-status')).toContainText('중지됨');
  await expect(page.locator('#simulate-start')).toBeEnabled();
  await expect(page.locator('#simulation-status')).not.toContainText('목표 달성!');
});
