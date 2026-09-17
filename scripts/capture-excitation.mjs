import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.argv[2]??'http://127.0.0.1:3016',root=new URL('../',import.meta.url),out=new URL('outputs/verification/p5/',root);
await mkdir(out,{recursive:true});const browser=await chromium.launch({channel:'chromium'}),errors=[],artifacts=[];
const sha=async u=>createHash('sha256').update(await readFile(u)).digest('hex');
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/#tissue`);await page.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(3).click();
 const scene=page.getByTestId('tissue-scene'),panel=page.getByRole('region',{name:'Muscle excitation experiment'});
 await page.getByLabel('Enable excitation experiment').check();await expect(panel).toHaveAttribute('data-result','single:1',{timeout:30000});
 const samples=[];
 for(const t of ['0','2','10','100']){
  await page.getByLabel('Excitation playhead').fill(t);await scene.scrollIntoViewIfNeeded();await page.waitForTimeout(150);
  const name=`excitation-${t}ms.png`;await page.screenshot({path:new URL(name,out).pathname,fullPage:true});artifacts.push(name);
  samples.push({timeMs:Number(t),voltage:await page.getByLabel('Excitation membrane voltage').textContent(),calcium:await page.getByLabel('Excitation free calcium').textContent(),postStroke:await page.getByLabel('Excitation post stroke').textContent(),length:await page.getByLabel('Sarcomere length value').textContent()});
 }
 await page.getByLabel('Excitation stimulus').selectOption('train');await expect(panel).toHaveAttribute('data-result','train:1',{timeout:30000});
 await page.getByLabel('Excitation playhead').fill('110');await scene.scrollIntoViewIfNeeded();await page.waitForTimeout(150);
 await page.screenshot({path:new URL('train-110ms.png',out).pathname,fullPage:true});artifacts.push('train-110ms.png');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('excitation-mobile.png',out).pathname,fullPage:true});artifacts.push('excitation-mobile.png');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(errors.length||overflow)throw new Error(JSON.stringify({errors,overflow}));
 const receipt={recordedAt:new Date().toISOString(),invocation:`node scripts/capture-excitation.mjs ${base}`,baseURL:base,browser:browser.version(),pageErrors:errors,mobileOverflow:overflow,samples,
  scope:'Actual browser activation overlay driven by the full archived mouse-muscle model, at prescribed fixed geometry length; not human or mechanical shortening validation',
  sourceHashes:Object.fromEntries(await Promise.all(['app/tissue/excitation.ts','app/tissue/TissueScene.tsx','app/tissue/ExcitationPanel.tsx','app/tissue/use-excitation.ts','app/tissue/recording.ts'].map(async p=>[p,await sha(new URL(p,root))]))),
  artifacts:Object.fromEntries(await Promise.all(artifacts.map(async p=>[p,await sha(new URL(p,out))])))};
 await writeFile(new URL('capture.json',out),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{await browser.close();}
