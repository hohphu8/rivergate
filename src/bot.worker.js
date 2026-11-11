import { search } from './search.js';
self.onmessage = ({data}) => {
  if(data.type!=='search') return;
  const {id,key,state,budgetMs}=data;
  try {
    const result=search(state,{budgetMs,onProgress:progress=>self.postMessage({type:'progress',id,key,...progress})});
    self.postMessage({type:'result',id,key,...result});
  } catch {self.postMessage({type:'error',id,key,message:'Không thể tính nước đi.'});}
};
