import type {Scenario} from './types';
export const scenarios:Scenario[]=[
  {id:'baseline',name:'At rest',description:'A resting body between meals.',duration:3600,events:[]},
  {id:'meal',name:'After a meal',description:'A mixed meal moves from the stomach into the blood, the pancreas answers with insulin, and the liver and muscles store the sugar.',duration:10800,events:[{at:0,label:'Mixed meal',action:{kind:'meal',meal:{carbs:75,protein:25,fat:20,water:350,sodium:600}}}]},
  {id:'exercise',name:'Exercise & recovery',description:'Twenty minutes of moderate exercise: the heart speeds up, blood shifts to the muscles, then everything settles.',duration:3600,events:[{at:120,label:'Begin moderate exercise',action:{kind:'environment',values:{exercise:.5}}},{at:1320,label:'Begin recovery',action:{kind:'environment',values:{exercise:0}}},{at:1500,label:'Drink 400 mL water',action:{kind:'meal',meal:{carbs:0,protein:0,fat:0,water:400,sodium:0}}}]},
  {id:'water',name:'A big glass of water',description:'750 mL of water dilutes the blood a little; the kidneys respond by making more urine.',duration:10800,events:[{at:0,label:'Drink 750 mL water',action:{kind:'meal',meal:{carbs:0,protein:0,fat:0,water:750,sodium:0}}}]},
];
