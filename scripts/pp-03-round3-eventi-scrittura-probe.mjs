import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const prisma = new PrismaClient();
const RADICE = path.resolve("src/app/api/v1");
const scopri=(d=RADICE,p=[])=>{const t=[];for(const v of fs.readdirSync(d,{withFileTypes:true})){if(v.isDirectory())t.push(...scopri(path.join(d,v.name),[...p,v.name]));else if(v.name==="route.ts")t.push({s:p,f:path.join(d,v.name)});}return t;};
const R=scopri().sort((a,b)=>a.s.filter(x=>x.startsWith("[")).length-b.s.filter(x=>x.startsWith("[")).length);
const abbina=(pth)=>{const seg=pth.replace(/^\/api\/v1\//,"").split("/").filter(Boolean);for(const r of R){if(r.s.length!==seg.length)continue;const pa={};let ok=true;for(let i=0;i<seg.length;i++){const a=r.s[i];if(a.startsWith("["))pa[a.slice(1,-1)]=seg[i];else if(a!==seg[i]){ok=false;break;}}if(ok)return{r,pa};}return null;};
let S=null,RU=null,CA=null;const mods=new Map();
globalThis.fetch=async(inp,init={})=>{const u=new URL(String(inp),"http://x.invalid");const m=String(init.method||"GET").toUpperCase();const h=new Headers(init.headers||{});if(S)h.set("authorization",`Bearer ${S}`);if(CA)h.set("x-active-club-id",CA);if(RU)h.set("x-active-access-role",RU);if(init.body&&!h.has("content-type"))h.set("content-type","application/json");const rq=new Request(u.toString(),{...init,headers:h});const ab=abbina(u.pathname);if(!ab)throw new Error("no route "+u.pathname);if(!mods.has(ab.r.f))mods.set(ab.r.f,await import(pathToFileURL(ab.r.f).href));return mods.get(ab.r.f)[m](rq,{params:ab.pa});};
const call=async(p,i)=>{try{const r=await globalThis.fetch(p,i);return{stato:r.status,corpo:await r.json().catch(()=>null)};}catch(e){return{stato:-1,corpo:{error:{message:String(e?.message)}}};}};
const auth=await import(pathToFileURL(path.resolve("src/lib/server/auth.ts")).href);
const CLUB=randomUUID();
const pres=await prisma.user.upsert({where:{email:"pp03r3e-pres@example.invalid"},update:{},create:{id:randomUUID(),email:"pp03r3e-pres@example.invalid",first_name:"P",last_name:"E",password_hash:"x",role:"user",email_verified_at:new Date(),updated_at:new Date()}});
const mist=await prisma.user.upsert({where:{email:"pp03r3e-mist@example.invalid"},update:{},create:{id:randomUUID(),email:"pp03r3e-mist@example.invalid",first_name:"M",last_name:"E",password_hash:"x",role:"user",email_verified_at:new Date(),updated_at:new Date()}});
await prisma.club.deleteMany({where:{slug:{startsWith:"pp03r3e-"}}});
await prisma.club.create({data:{id:CLUB,slug:`pp03r3e-${Date.now()}`,name:"E",creator_id:pres.id,settings:{seasons:[{id:"2026-27",label:"x",startDate:"2026-07-01",endDate:"2027-06-30",status:"active"}]},categories:[{id:"c1",name:"U12"},{id:"c2",name:"U15"}],club_sites:[{id:"s1",name:"N",active:true}],category_groups:[],structures:[],trainers:[{id:"t1",first_name:"M",last_name:"E",email:mist.email,linkedUserId:mist.id,categories:["c1"],groups:[]}],staff_members:[],trainings:[],matches:[],appointments:[],updated_at:new Date()}});
for(const [u,r] of [[pres,"owner"],[mist,"trainer"]]) await prisma.organizationUser.create({data:{id:randomUUID(),organization_id:CLUB,user_id:u.id,role:r,is_primary:true,updated_at:new Date()}});
const giorno=(d)=>new Date(Date.now()+d*86400000).toISOString().slice(0,10);
try{
S=(await auth.createSessionForUser(mist)).access_token; RU="trainer"; CA=CLUB;
const crea=await call("/api/v1/events",{method:"POST",body:JSON.stringify({kind:"training",title:"Creato dall'allenatore",date:giorno(3),time:"18:00",endTime:"19:30",categoryId:"c1",categories:["c1"],siteId:"s1"})});
console.log("TRAINER-CREA-EVENTO:",crea.stato,JSON.stringify(crea.corpo).slice(0,240));
const creaFuori=await call("/api/v1/events",{method:"POST",body:JSON.stringify({kind:"training",title:"Fuori perimetro",date:giorno(3),time:"18:00",endTime:"19:30",categoryId:"c2",categories:["c2"],siteId:"s1"})});
console.log("TRAINER-CREA-FUORI:",creaFuori.stato,JSON.stringify(creaFuori.corpo).slice(0,200));
const id=crea.corpo?.data?.id;
if(id){
  const mod=await call(`/api/v1/events/${id}`,{method:"PATCH",body:JSON.stringify({time:"20:00",title:"Spostato"})});
  console.log("TRAINER-MODIFICA-EVENTO:",mod.stato,JSON.stringify(mod.corpo).slice(0,240));
  const spostaFuori=await call(`/api/v1/events/${id}`,{method:"PATCH",body:JSON.stringify({categories:["c2"],categoryId:"c2"})});
  console.log("TRAINER-SPOSTA-IN-ALTRA-CATEGORIA:",spostaFuori.stato,JSON.stringify(spostaFuori.corpo).slice(0,240));
}
} finally {
await prisma.auditLog.deleteMany({where:{organization_id:CLUB}}).catch(()=>{});
await prisma.club.delete({where:{id:CLUB}}).catch((e)=>console.error("pulizia",e.message));
await prisma.$disconnect();
}
