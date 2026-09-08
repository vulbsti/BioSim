import {HORMONES, type BodyState, type Hormone} from './types';
import {concentration} from './transport';

export const hormoneInfo: Record<Hormone, {name: string; source: string; target: string; tau: number; pathway: string}> = {
  insulin: {name:'Insulin', source:'Pancreatic β compartment', target:'Liver · muscle · adipose', tau:6, pathway:'Glucose and GLP-1 increase secretion; promotes glucose uptake and storage.'},
  glucagon: {name:'Glucagon', source:'Pancreatic α compartment', target:'Liver', tau:8, pathway:'Low glucose and protein absorption increase secretion; mobilizes hepatic glycogen.'},
  epinephrine: {name:'Epinephrine', source:'Adrenal medulla', target:'Heart · liver · muscle', tau:2, pathway:'Sympathetic drive increases secretion; increases cardiac work and fuel release.'},
  norepinephrine: {name:'Norepinephrine', source:'Sympathetic nerves / adrenal medulla', target:'Vessels · heart', tau:2, pathway:'Sympathetic activation raises vascular tone and cardiac activity.'},
  crh: {name:'CRH', source:'Hypothalamus', target:'Anterior pituitary', tau:8, pathway:'Stress drives CRH; cortisol supplies negative feedback.'},
  acth: {name:'ACTH', source:'Anterior pituitary', target:'Adrenal cortex', tau:12, pathway:'CRH stimulates ACTH; cortisol inhibits the upstream axis.'},
  cortisol: {name:'Cortisol', source:'Adrenal cortex', target:'Liver · hypothalamus · pituitary', tau:65, pathway:'ACTH raises cortisol with a delay; increases glucose synthesis and inhibits CRH / ACTH.'},
  trh: {name:'TRH', source:'Hypothalamus', target:'Anterior pituitary', tau:12, pathway:'Cold increases hypothalamic drive; thyroid hormone feeds back.'},
  tsh: {name:'TSH', source:'Anterior pituitary', target:'Thyroid', tau:60, pathway:'TRH stimulates TSH; thyroid hormone inhibits secretion.'},
  thyroid: {name:'T3 / T4 activity', source:'Thyroid', target:'Systemic metabolism', tau:1440, pathway:'TSH slowly raises thyroid activity, which changes basal oxygen and fuel demand.'},
  adh: {name:'ADH / vasopressin', source:'Hypothalamus → posterior pituitary', target:'Kidney collecting ducts', tau:12, pathway:'High osmolarity or low circulating volume raises ADH and reduces urinary water loss.'},
  renin: {name:'Renin activity', source:'Kidney', target:'Circulating angiotensinogen', tau:15, pathway:'Low pressure, low volume, and sympathetic drive stimulate renin. Renin is an enzyme.'},
  angiotensin: {name:'Angiotensin II', source:'Renin / ACE cascade', target:'Vessels · adrenal cortex', tau:3, pathway:'Renin drives angiotensin activity; increases vascular tone and aldosterone.'},
  aldosterone: {name:'Aldosterone', source:'Adrenal cortex', target:'Kidney distal nephron', tau:35, pathway:'Angiotensin II raises aldosterone; reduces sodium excretion.'},
  anp: {name:'ANP', source:'Atrial myocardium', target:'Kidneys', tau:5, pathway:'Volume expansion increases ANP; promotes urinary water and sodium loss.'},
  gastrin: {name:'Gastrin', source:'Stomach', target:'Stomach', tau:10, pathway:'Gastric food stimulates gastrin and the pepsin activity proxy.'},
  secretin: {name:'Secretin', source:'Duodenum', target:'Pancreas', tau:5, pathway:'Gastric delivery drives a secretin proxy for bicarbonate-supported digestion.'},
  cck: {name:'CCK', source:'Small intestine', target:'Pancreas · gallbladder · stomach', tau:8, pathway:'Intestinal fat and protein raise CCK; increases enzyme activity and slows emptying.'},
  glp1: {name:'GLP-1', source:'Intestine', target:'Pancreas · stomach', tau:4, pathway:'Nutrient absorption raises GLP-1; amplifies insulin and slows gastric emptying.'},
  ghrelin: {name:'Ghrelin', source:'Stomach', target:'Hypothalamus', tau:30, pathway:'Falls after eating; contributes to the displayed hunger signal.'},
  leptin: {name:'Leptin', source:'Adipose tissue', target:'Hypothalamus', tau:240, pathway:'Stored fat supplies a slow satiety signal; modulates the growth / reproductive drive.'},
  melatonin: {name:'Melatonin', source:'Pineal gland', target:'Circadian / sleep controller', tau:35, pathway:'Nighttime drive raises melatonin; external light suppresses it.'},
  gh: {name:'Growth hormone', source:'Anterior pituitary', target:'Liver · adipose', tau:25, pathway:'Sleep drive increases GH; IGF-1 inhibits it. Pulsatility is simplified.'},
  igf1: {name:'IGF-1', source:'Liver', target:'Growth axis', tau:720, pathway:'GH slowly increases IGF-1, which closes the negative feedback loop.'},
  gnrh: {name:'GnRH activity', source:'Hypothalamus', target:'Anterior pituitary', tau:60, pathway:'Energy availability and cortisol affect drive; testosterone supplies negative feedback.'},
  lh: {name:'LH', source:'Anterior pituitary', target:'Testicular endocrine compartment', tau:60, pathway:'GnRH drives LH and testosterone feeds back; no sperm or cellular dynamics.'},
  fsh: {name:'FSH', source:'Anterior pituitary', target:'Testicular endocrine compartment', tau:180, pathway:'GnRH drives FSH; inhibin supplies feedback.'},
  testosterone: {name:'Testosterone', source:'Testicular endocrine compartment', target:'Hypothalamus · pituitary', tau:240, pathway:'LH drives testosterone; this reference models the adult male endocrine axis.'},
  inhibin: {name:'Inhibin B', source:'Testicular endocrine compartment', target:'Anterior pituitary', tau:180, pathway:'FSH drives inhibin, which suppresses FSH.'},
  pth: {name:'PTH', source:'Parathyroid', target:'Kidney · bone calcium pool', tau:5, pathway:'Low calcium raises PTH; promotes the calcium-restoring flux proxy and calcitriol.'},
  calcitriol: {name:'Calcitriol', source:'Kidney', target:'Calcium balance', tau:360, pathway:'PTH drives calcitriol; closes a simplified calcium-regulation loop.'},
};

export const clamp = (x:number, lo:number, hi:number) => Math.min(hi, Math.max(lo,x));
export const relax = (x:number, target:number, dt:number, tau:number) => x+(target-x)*(-Math.expm1(-dt/tau));
export function updateHormones(s:BodyState, dt:number) {
  const h={...s.hormones}, g=concentration(s.transport.compartments.arterial,'glucose')*100000;
  const volume=s.plasma/3000, hour=(8+s.time/3600)%24;
  const night=(1+Math.cos((hour-2)*Math.PI/12))/2;
  const gastric=s.stomach.carbs+s.stomach.protein+s.stomach.fat;
  const absorbed=s.digestionRates.carbs;
  const stress=Math.max(0,s.sympathetic-.15);
  const targets:Record<Hormone,number>={
    insulin:clamp(1+(g-90)/22+absorbed*1.8+.22*(h.glp1-1)-stress*.4,.08,12),
    glucagon:clamp(1+(90-g)/30+.3*s.digestionRates.protein+.3*stress-.18*(h.insulin-1),.15,6),
    epinephrine:1+stress*8, norepinephrine:1+stress*5,
    crh:(1+stress*4)/(1+.65*(h.cortisol-1)), acth:h.crh/(1+.45*(h.cortisol-1)), cortisol:h.acth,
    trh:(1+Math.max(0,22-s.inputs.temperature)*.02)/(1+.8*(h.thyroid-1)), tsh:h.trh/(1+.8*(h.thyroid-1)), thyroid:h.tsh,
    adh:clamp(1+(s.osmolarity-285)*.22+(1-volume)*18,.08,12),
    renin:clamp(1+(93-s.map)*.045+(1-volume)*12+stress,.1,8), angiotensin:h.renin, aldosterone:h.angiotensin,
    anp:clamp(1+(volume-1)*15,.1,8),
    gastrin:1+gastric/30+s.inputs.smell*.5, secretin:1+gastric/75,
    cck:1+(s.gut.fat+s.gut.protein)/12, glp1:1+absorbed*2,
    ghrelin:clamp(1.2-gastric/75-absorbed*.7,.1,2), leptin:clamp(s.fatStore/12000,.2,3),
    melatonin:.1+3*night*(1-s.inputs.light),
    gh:(1+1.8*s.inputs.sleep+.3*stress)/(1+.8*(h.igf1-1)), igf1:h.gh,
    gnrh:clamp(h.leptin/(1+.5*(h.testosterone-1)+.2*Math.max(0,h.cortisol-1)),.1,3),
    lh:h.gnrh/(1+.5*(h.testosterone-1)), fsh:h.gnrh/(1+.6*(h.inhibin-1)), testosterone:h.lh, inhibin:h.fsh,
    pth:clamp(1+(2.4-s.calcium)*8,.1,5), calcitriol:h.pth,
  };
  for(const key of HORMONES) {
    const target=clamp(targets[key],.03,15), tau=hormoneInfo[key].tau;
    s.hormoneFlux[key]={target,secretion:target/tau,clearance:h[key]/tau};
    s.hormones[key]=relax(h[key],target,dt,tau);
  }
}
