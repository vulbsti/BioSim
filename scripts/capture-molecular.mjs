import {chromium} from '@playwright/test';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const base=process.argv[2]??'http://localhost:3016';
const root=new URL('../',import.meta.url),output=new URL('outputs/verification/p1/',root);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chromium'}),errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1080},recordVideo:{dir:output.pathname,size:{width:1440,height:1080}}});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto(`${base}/#molecular`);
  await page.getByText('Response ready',{exact:true}).waitFor();
  await page.getByRole('tab',{name:/Insulin signaling/}).click();
  await page.getByRole('heading',{name:'A signal crosses the membrane.'}).waitFor();
  await page.getByText('Response ready',{exact:true}).waitFor();
  await page.evaluate(()=>window.scrollTo(0,document.querySelector('.mol-layout').getBoundingClientRect().top+window.scrollY-20));
  await page.getByLabel('Mechanism playback speed').selectOption('120');
  await page.getByRole('button',{name:'Play mechanism'}).click();
  await page.waitForTimeout(16000);
  await page.getByRole('button',{name:'Pause mechanism'}).click();
  const finalPlayhead=await page.getByLabel('Mechanism elapsed time').textContent();
  await page.screenshot({path:new URL('insulin-response.png',output).pathname});
  const video=page.video();await context.close();
  await rename(await video.path(),new URL('insulin-response.webm',output));

  const review=await browser.newContext({viewport:{width:1440,height:1080}}),desktop=await review.newPage();
  desktop.on('pageerror',error=>errors.push(error.message));
  await desktop.goto(`${base}/#molecular`);await desktop.getByText('Response ready',{exact:true}).waitFor();
  await desktop.getByLabel('Experiment time',{exact:true}).fill('300');
  await desktop.screenshot({path:new URL('receptor-binding-desktop.png',output).pathname,fullPage:true});
  await desktop.getByRole('tab',{name:/Insulin signaling/}).click();await desktop.getByText('Response ready',{exact:true}).waitFor();
  await desktop.getByLabel('Experiment time',{exact:true}).fill('900');
  await desktop.screenshot({path:new URL('insulin-desktop.png',output).pathname,fullPage:true});
  await desktop.setViewportSize({width:390,height:844});
  await desktop.screenshot({path:new URL('insulin-mobile.png',output).pathname,fullPage:true});
  const mobileOverflow=await desktop.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  await review.close();
  if(errors.length||mobileOverflow)throw new Error(JSON.stringify({errors,mobileOverflow}));
  const files=['insulin-response.webm','insulin-response.png','receptor-binding-desktop.png','insulin-desktop.png','insulin-mobile.png'];
  const receipt={recordedAt:new Date().toISOString(),invocation:`node scripts/capture-molecular.mjs ${base}`,baseURL:base,
    scope:'Recorded actual browser playback of the isolated archived insulin model. Schematic populations; not new 3D anatomy or biological validation.',
    viewport:{width:1440,height:1080},playbackSpeed:120,wallPlaybackSeconds:16,finalPlayhead,browser:browser.version(),pageErrors:errors,mobileOverflow,
    sourceScriptSHA256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    artifacts:Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL(file,output))).digest('hex')]))) };
  await writeFile(new URL('capture.json',output),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
} finally {await browser.close();}
