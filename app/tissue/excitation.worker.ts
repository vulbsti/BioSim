import {runExcitation,type ExcitationConfig} from './excitation';
self.onmessage=({data}:{data:{config:ExcitationConfig}})=>{
 try{self.postMessage({result:runExcitation(data.config)});}catch(error){self.postMessage({error:error instanceof Error?error.message:'Excitation calculation failed.'});}
};
