import { client } from '../src/lib/api';
import { buildProject, resumeGeneration } from '../src/lib/generation';
const plan={title:'恢复用蓝图',summary:'任务管理',audience:'团队',features:[0,1,2].map(i=>({name:String(i),description:'功能',priority:'P0'})),pages:[0,1].map(i=>({name:String(i),purpose:'查看'})),entities:[{name:'任务',fields:['标题']}],acceptance:['新增','修改','删除'],outOfScope:['支付']};
export async function pipeline(mode: 'success'|'lost'|'stopped'|'resume') {
  const requests: any[]=[];
  const writes: any[]=[];
  let current=true;
  const generation={id:1,project_id:1,request_text:'test',status:'running',current_stage:'building',public_log:[],product_spec:plan};
  for (const name of ['generations','projects','versions']) client.entities[name].update=async (args:any)=>{writes.push(args);return {data:{}} as any;};
  client.apiCall.invoke=async (request:any)=>{
    requests.push(structuredClone(request));
    if (request.url.endsWith('/step')) {
      if (mode==='lost') throw new Error('network unavailable');
      if (mode==='stopped') current=false;
      return {data:{generation:{...generation,status:'succeeded'},status:'succeeded',stage:'source',kind:'build',version:{id:8,version_number:3,app_spec:{runtime:'html',app:{name:'test',description:'test'},requirements:['test']},source_bundle:{files:{'index.html':'<html><head></head><body>test</body></html>'}}}}} as any;
    }
    return {data:{generation,status:'pending',stage:'source',kind:'build'}} as any;
  };
  let error='';let version:any;
  try {
    if(mode==='resume') version=(await resumeGeneration(generation,{isCurrent:()=>current})).version;
    else version=await buildProject(1,plan,'test',{isCurrent:()=>current});
  } catch(e){error=String(e);}
  return {requests,writes,error,version};
}
