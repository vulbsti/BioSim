// Renders the sample blood test report to PDF and PNG: node scripts/personal/render-report.cjs
const {chromium}=require('playwright'),path=require('path');
const dir=path.resolve(__dirname,'../../public/samples/personal');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:820,height:760}});
await p.goto('file://'+dir+'/sam-blood-test.html');
await p.pdf({path:dir+'/sam-blood-test.pdf',format:'A4',printBackground:true});
await p.screenshot({path:dir+'/sam-blood-test.png',fullPage:true});await b.close();})();
