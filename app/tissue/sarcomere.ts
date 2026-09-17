/** Representative geometry, in metres. Kinematics only; no force/ATP model. */
export const SARCOMERE={rest:2.5e-6,min:2e-6,max:3.2e-6,thick:1.6e-6,thin:1e-6} as const;
export function sarcomereBands(length:number){
 if(!Number.isFinite(length)||length<SARCOMERE.min-1e-15||length>SARCOMERE.max+1e-15)throw new Error('Sarcomere length is outside the inspection range.');
 return {length,aBand:SARCOMERE.thick,halfIBand:(length-SARCOMERE.thick)/2,hZone:Math.max(0,length-2*SARCOMERE.thin),overlapPerSide:Math.max(0,Math.min(SARCOMERE.thin,(SARCOMERE.thick+2*SARCOMERE.thin-length)/2))};
}
export function filamentTranslation(side:number,length:number){
 sarcomereBands(length);
 if(![-1,0,1].includes(side))throw new Error('Invalid filament attachment.');
 return side*(length-SARCOMERE.rest)/2;
}
