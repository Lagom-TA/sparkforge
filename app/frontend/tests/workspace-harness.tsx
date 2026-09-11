// Browser integration fixture: SDK calls are simulated, never real authentication/model evidence.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AppRoutes} from '../src/App';
import {client} from '../src/lib/api';
import '../src/index.css';
const plan={title:'任务工具',summary:'管理任务',audience:'团队',features:[0,1,2].map(i=>({name:String(i),description:'管理',priority:'P0'})),pages:[{name:'任务',purpose:'管理'}],entities:[{name:'任务',fields:['名称']}],acceptance:['新增','编辑','删除'],outOfScope:['支付']};
const spec={runtime:'crud',app:{name:'任务工具',description:'管理任务'},navigation:['任务'],dashboard:[],collections:[{key:'tasks',label:'任务',fields:[{key:'title',label:'名称',type:'text'}]}],views:[{type:'table',collection:'tasks',title:'任务',columns:['title']}],primaryAction:'新增'};
const versions=[2,1].map(id=>({id,project_id:1,version_number:id,product_spec:plan,app_spec:spec,source_bundle:{files:{'src/App.tsx':`export default function App(){ return <h1>Version ${id}</h1>; }`,'src/index.css':`/* version ${id} styles */ body { color: black; }`}},change_summary:`测试版本 ${id}`}));
const project={id:1,name:'恢复测试',initial_prompt:'测试项目的完整需求',status:'awaiting_verification',active_version_id:Number(sessionStorage.getItem('active')||2)};
let failProjects=true;
(client.auth as any).me=async()=>{if(localStorage.getItem('isLougOutManual'))throw Error('401');return {data:{id:'test'}};};
(client.auth as any).toLogin=()=>{localStorage.removeItem('isLougOutManual');window.location.reload();};
(client.entities.projects as any).get=async()=>({data:project});
(client.entities.projects as any).query=async()=>{if(location.search.includes('home')&&failProjects){failProjects=false;throw Error('temporary list failure');}return {data:{items:[project]}};};
(client.entities.versions as any).query=async()=>({data:{items:versions}});
for(const name of ['generations','share_links','app_records']) (client.entities[name] as any).query=async()=>({data:{items:[]}});
(client.apiCall as any).invoke=async(request:any)=>{
 if(request.url.endsWith('/restore')){
  const id=Number(request.url.split('/').at(-2));
  if(request.data.expected_active_version_id!==project.active_version_id) throw Error('版本冲突');
  project.active_version_id=id;sessionStorage.setItem('active',String(id));return {data:project};
 }
 return {data:{verified:false}};
};
// Delayed admission exercises controls before the server returns the new task id.
if(location.search.includes('admission')) {
  let job:any;
  const previous=location.search.includes('existing') ? {id:88,project_id:1,status:'awaiting_approval',current_stage:'awaiting_approval',public_log:[],product_spec:plan} : undefined;
  const requests:any[]=[];
  (window as any).admissionRequests=requests;
  (client.entities.generations as any).query=async()=>({data:{items:job?[job.generation]:previous?[previous]:[]}});
  (client.apiCall as any).invoke=async(r:any)=>{
    requests.push(r);
    if(r.url==='/api/v1/generation-jobs') {
      await new Promise(resolve=>setTimeout(resolve,700));
      job={generation:{id:99,project_id:1,status:'running',current_stage:'building',public_log:[],product_spec:plan},status:'pending',stage:'spec',kind:'build'};
    } else if(r.url.endsWith('/control')) {
      await new Promise(resolve=>setTimeout(resolve,300));
      job={...job,status:r.data.action,generation:{...job.generation,status:r.data.action}};
    }
    return {data:r.url.includes('generation-jobs')?job:{verified:false}};
  };
}
const home=location.search.includes('home');
history.replaceState(null,'',home?'/?home':'/workspace/1');
createRoot(document.getElementById('fixture')!).render(<BrowserRouter><AppRoutes/></BrowserRouter>);
