/// <reference lib="webworker" />
import {bakeOcclusion,type Surface} from './occlusion';
/** The occlusion bake runs here so the page stays responsive while the brain loads. */
self.onmessage=(e:MessageEvent<{occluders:Surface[];targets:number[]}>)=>{
 const {occluders,targets}=e.data,result=bakeOcclusion(occluders,targets.map(i=>occluders[i]));
 self.postMessage(result,result.map(r=>r.buffer as ArrayBuffer));
};
