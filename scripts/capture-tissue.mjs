import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base=process.argv[2]??'http://localhost:3016';
const root=new URL('../',import.meta.url),output=new URL('outputs/verification/p2/',root);
const path=file=>new URL(file,output).pathname;
const hash=async url=>createHash('sha256').update(await readFile(url)).digest('hex');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chromium'}),errors=[];
const context=await browser.newContext({viewport:{width:1440,height:1080},recordVideo:{dir:output.pathname,size:{width:1440,height:1080}}});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const ready=async entities=>{
 await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-entities',String(entities));
 await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-ready','true');
};
const stage=()=>page.evaluate(()=>window.scrollTo(0,document.querySelector('.tissue-workspace').getBoundingClientRect().top+window.scrollY-18));
try{
 await page.goto(`${base}/#tissue`);await ready(3);
 await expect(page.getByLabel('Tissue mechanism time')).toBeEnabled();
 await page.screenshot({path:path('muscle-desktop.png'),fullPage:true});
 await stage();await page.waitForTimeout(1800);
 await page.getByLabel('Show bone context',{exact:true}).check();await page.waitForTimeout(1800);
 await page.getByRole('button',{name:'Explore fascicle',exact:true}).click();await ready(39);
 await stage();await page.waitForTimeout(2200);
 await page.screenshot({path:path('fascicle-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Enter muscle fiber',exact:true}).click();await ready(7);
 await stage();await page.waitForTimeout(2200);
 await page.getByRole('button',{name:'View cut end',exact:true}).click();
 await page.getByLabel('Show outer sheath',{exact:true}).uncheck();await page.waitForTimeout(2200);
 await page.screenshot({path:path('fiber-cut-end-desktop.png'),fullPage:true});
 await page.getByRole('button',{name:'Reset specimen camera',exact:true}).click();
 await page.getByLabel('Show outer sheath',{exact:true}).check();
 await page.getByLabel('Tissue playback speed').selectOption('120');
 await page.getByRole('button',{name:'Play tissue signaling',exact:true}).click();
 await stage();await page.waitForTimeout(16000);
 await page.getByRole('button',{name:'Pause tissue signaling',exact:true}).click();
 const finalPlayhead=await page.getByLabel('Tissue mechanism elapsed time').textContent();
 const finalGLUT4=await page.getByLabel('Tissue surface GLUT4').textContent();
 await stage();await page.screenshot({path:path('fiber-signaling-desktop.png'),fullPage:true});
 const video=page.video();await context.close();await rename(await video.path(),path('tissue-explorer.webm'));

 const review=await browser.newContext({viewport:{width:390,height:844}}),mobile=await review.newPage();
 mobile.on('pageerror',error=>errors.push(error.message));
 await mobile.goto(`${base}/#tissue`);
 await expect(mobile.getByTestId('tissue-scene')).toHaveAttribute('data-ready','true');
 await mobile.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(2).click();
 await expect(mobile.getByTestId('tissue-scene')).toHaveAttribute('data-entities','7');
 await mobile.getByLabel('Tissue mechanism time').fill('900');
 await mobile.getByLabel('Show signaling overlay').check();
 await mobile.screenshot({path:path('fiber-mobile.png'),fullPage:true});
 const mobileOverflow=await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 await review.close();
 if(errors.length||mobileOverflow)throw new Error(JSON.stringify({errors,mobileOverflow}));

 const conversion=['-y','-loglevel','error','-i',path('tissue-explorer.webm'),'-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',path('tissue-explorer.mp4')];
 execFileSync('ffmpeg',conversion);
 const videoInfo=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,width,height','-of','json',path('tissue-explorer.mp4')],{encoding:'utf8'}));
 const files=['tissue-explorer.webm','tissue-explorer.mp4','muscle-desktop.png','fascicle-desktop.png','fiber-cut-end-desktop.png','fiber-signaling-desktop.png','fiber-mobile.png'];
 const receipt={recordedAt:new Date().toISOString(),invocation:`node scripts/capture-tissue.mjs ${base}`,baseURL:base,
  scope:'Actual browser recording of Blender-authored source anatomy and representative microscopic geometry. GLUT4 brightness observes the archived mixed-preparation insulin model; no simulated contraction, cell trafficking or microvascular flow is claimed.',
  viewport:{width:1440,height:1080},playbackSpeed:120,wallPlaybackSeconds:16,finalPlayhead,finalGLUT4,browser:browser.version(),pageErrors:errors,mobileOverflow,
  sourceScriptSHA256:await hash(new URL(import.meta.url)),manifestSHA256:await hash(new URL('public/models/multiscale/muscle-pilot/manifest.json',root)),
  videoInfo,conversion:{executable:'ffmpeg',arguments:conversion},
  artifacts:Object.fromEntries(await Promise.all(files.map(async file=>[file,await hash(new URL(file,output))])))};
 await writeFile(path('capture.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{await browser.close();}
