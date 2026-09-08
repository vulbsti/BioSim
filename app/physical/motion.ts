import type {BodyState} from '../simulation/types';
/** Display mechanics at the current model rates. These do not feed energy back into the solver. */
export function cardiacContraction(phase:number):number {
 const p=((phase%1)+1)%1;
 return p<.36?Math.sin(p/.36*Math.PI)**2:0;
}
export function respiratoryCycle(phase:number):{inflation:number;inhaling:boolean;flow:number}{
 const p=((phase%1)+1)%1,inhaling=p<.4;
 const local=inhaling?p/.4:(p-.4)/.6;
 return {inflation:inhaling?(1-Math.cos(local*Math.PI))/2:(1+Math.cos(local*Math.PI))/2,inhaling,flow:Math.sin(local*Math.PI)};
}
export function motionRates(s:BodyState){
 return {heartHz:Math.max(0,s.heartRate/60),breathHz:Math.max(0,s.respiratoryRate/60),bloodSpeed:Math.min(4,Math.max(0,s.cardiacOutput/5.04)),lungExcursion:Math.min(.065,Math.max(0,s.tidalVolume/500*.022)),digesting:Math.min(1,(s.stomach.carbs+s.stomach.protein+s.stomach.fat+s.gut.carbs+s.gut.protein+s.gut.fat)/50)};
}
