export async function gotoReset(page,path){
  const url=new URL(path,'http://127.0.0.1:5173');url.searchParams.set('recovery','reset');
  await page.goto(url.href);
}
