import { client } from '../src/lib/api';
import { planProject, buildProject } from '../src/lib/generation';

export async function interruptedPlanDoesNotOverwrite() {
  const projectWrites: unknown[] = [];
  const generationWrites: unknown[] = [];
  let current = true;
  const generation = {id:1,project_id:1,request_text:'test',status:'running',current_stage:'planning',public_log:[]};
  client.entities.generations.create = async () => ({data:generation}) as any;
  client.entities.generations.update = async ({data}: any) => { generationWrites.push(data); return {data:{...generation,...data}} as any; };
  client.entities.projects.update = async ({data}: any) => { projectWrites.push(data); return {data} as any; };
  client.ai.gentxt = async () => { current = false; throw new Error('迟到的请求失败'); };
  try {
    await planProject(1, 'test', {isCurrent:() => current, getControl:() => current ? 'running' : 'stopped'});
  } catch { /* expected stale request */ }
  return {projectWrites, generationWrites};
}

export async function buildPersistsApprovedPlan() {
  const writes: any[] = [];
  const generation = {id:1,project_id:1,request_text:'test',status:'running',current_stage:'preparing',public_log:[]};
  client.entities.generations.create = async () => ({data:generation}) as any;
  client.entities.generations.update = async ({data}: any) => { writes.push(data); return {data:{...generation,...data}} as any; };
  client.entities.projects.update = async ({data}: any) => ({data}) as any;
  client.ai.gentxt = async () => { throw new Error('测试模型故障'); };
  const spec = {title:'恢复用蓝图',summary:'test',audience:'test',features:[],pages:[],entities:[],acceptance:[],outOfScope:[]};
  try { await buildProject(1, spec, 1, 'test'); } catch { /* test interrupted model */ }
  return writes;
}

export async function semanticBuildRepair(mode: 'repair' | 'invalid' | 'stopped') {
  const requests: any[] = [];
  const versions: any[] = [];
  let current = true;
  const generation = {id:1,project_id:1,request_text:'test',status:'running',current_stage:'building',public_log:[]};
  client.entities.generations.create = async () => ({data:generation}) as any;
  client.entities.generations.update = async ({data}: any) => ({data:{...generation,...data}}) as any;
  client.entities.projects.update = async ({data}: any) => ({data}) as any;
  client.entities.versions.create = async ({data}: any) => { versions.push(data); return {data:{id:1,...data}} as any; };
  client.ai.gentxt = async (request: any) => {
    requests.push(structuredClone(request));
    if (mode === 'stopped') current = false;
    const repaired = {appSpec:{app:{name:'测试',description:'测试'},navigation:[],dashboard:[],collections:[{key:'tasks',label:'任务',fields:[{key:'title',label:'标题',type:'text'},{key:'done',label:'完成',type:'boolean'}]}],views:[{type:'table',collection:'tasks',title:'任务'}],primaryAction:'添加'},files:{'src/App.tsx':'export default function App(){return null;}'}};
    return {data:{content:JSON.stringify(requests.length === 2 && mode === 'repair' ? repaired : {appSpec:{},files:{}})}} as any;
  };
  const spec = {title:'修复测试蓝图',summary:'test',audience:'test',features:[],pages:[],entities:[],acceptance:[],outOfScope:[]};
  let error = '';
  try { await buildProject(1,spec,1,'test',{isCurrent:()=>current}); } catch (e) { error = String(e); }
  return {requests,versions,error};
}
