import {runCirculation,type CirculationConfig} from './model';
self.onmessage=({data}:{data:{id:number;config:CirculationConfig}})=>{
 try{self.postMessage({id:data.id,result:runCirculation(data.config)});}
 catch(error){self.postMessage({id:data.id,error:error instanceof Error?error.message:'Circulation calculation failed.'});}
};
