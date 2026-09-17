import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.argv[2]??'http://localhost:3016',root=new URL('../',import.meta.url);
const output=new URL('outputs/verification/p2/sarcomere/',root);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chromium'}),errors=[],files=[];
const hash=async url=>createHash('sha256').update(await readFile(url)).digest('hex');
const capture=async(page,name)=>{await page.screenshot({path:new URL(name,output).pathname,fullPage:true});files.push(name);};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${base}/#tissue`);
 await page.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(3).click();
 const scene=page.getByTestId('tissue-scene');await expect(scene).toHaveAttribute('data-entities','6');
 await expect(scene).toHaveAttribute('data-ready','true');
 await page.getByRole('button',{name:'Front specimen view',exact:true}).click();
 const states=[];
 for(const length of ['3.2','2.5','2']){
  await page.getByLabel('Sarcomere length',{exact:true}).fill(length);
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-sarcomere-length',String(Number(length)*1e-6));
  await page.waitForTimeout(200);
  await capture(page,`length-${length}.png`);
  states.push({lengthMicrometers:Number(length),aBand:await page.getByLabel('A band length',{exact:true}).textContent(),hZone:await page.getByLabel('H zone length',{exact:true}).textContent()});
 }
 await page.getByRole('button',{name:'Reset specimen camera',exact:true}).click();await scene.scrollIntoViewIfNeeded();await page.waitForTimeout(200);await capture(page,'oblique.png');
 await page.locator('.tissue-provenance summary').click();const metrics=await page.locator('.tissue-provenance').innerText();
 await page.setViewportSize({width:390,height:844});await capture(page,'mobile.png');
 const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 if(errors.length||mobileOverflow)throw new Error(JSON.stringify({errors,mobileOverflow}));
 const receipt={recordedAt:new Date().toISOString(),invocation:`node scripts/capture-sarcomere.mjs ${base}`,browser:browser.version(),baseURL:base,pageErrors:errors,mobileOverflow,states,metrics,
  evidence:'Real browser captures of manual length-controlled filament sliding. No force, calcium, ATP kinetics, atomic resolution or physiological validation claimed.',
  manifestSHA256:await hash(new URL('public/models/multiscale/muscle-pilot/manifest.json',root)),
  artifacts:Object.fromEntries(await Promise.all(files.map(async name=>[name,await hash(new URL(name,output))])))};
 await writeFile(new URL('capture.json',output),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt,null,2));
}finally{await browser.close();}
