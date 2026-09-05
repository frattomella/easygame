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
const call=async(p,i)=>{const r=await globalThis.fetch(p,i);return{stato:r.status,corpo:await r.json().catch(()=>null)};};
const auth=await import(pathToFileURL(path.resolve("src/lib/server/auth.ts")).href);

const CLUB=randomUUID(); const AT=randomUUID();
const pres=await prisma.user.upsert({where:{email:"pp03r3d-pres@example.invalid"},update:{},create:{id:randomUUID(),email:"pp03r3d-pres@example.invalid",first_name:"P",last_name:"D",password_hash:"x",role:"user",email_verified_at:new Date(),updated_at:new Date()}});
const mist=await prisma.user.upsert({where:{email:"pp03r3d-mist@example.invalid"},update:{},create:{id:randomUUID(),email:"pp03r3d-mist@example.invalid",first_name:"M",last_name:"D",password_hash:"x",role:"user",email_verified_at:new Date(),updated_at:new Date()}});
await prisma.club.deleteMany({where:{slug:{startsWith:"pp03r3d-"}}});
await prisma.club.create({data:{id:CLUB,slug:`pp03r3d-${Date.now()}`,name:"D",creator_id:pres.id,settings:{seasons:[{id:"2026-27",label:"x",startDate:"2026-07-01",endDate:"2027-06-30",status:"active"}]},categories:[{id:"c1",name:"U12"}],club_sites:[{id:"s1",name:"N",active:true}],category_groups:[],structures:[],trainers:[{id:"t1",first_name:"M",last_name:"D",email:mist.email,linkedUserId:mist.id,categories:["c1"],groups:[]}],staff_members:[],trainings:[],matches:[],appointments:[],updated_at:new Date()}});
for(const [u,r] of [[pres,"owner"],[mist,"trainer"]]) await prisma.organizationUser.create({data:{id:randomUUID(),organization_id:CLUB,user_id:u.id,role:r,is_primary:true,updated_at:new Date()}});
await prisma.athlete.create({data:{id:AT,organization_id:CLUB,first_name:"A",last_name:"Z",status:"active",category_id:"c1",category_name:"U12",data:{},updated_at:new Date()}});
await prisma.athleteCategoryMembership.create({data:{id:randomUUID(),organization_id:CLUB,athlete_id:AT,category_id:"c1",site_id:"s1",updated_at:new Date()}});

try{
S=(await auth.createSessionForUser(pres)).access_token; RU="owner"; CA=CLUB;
const creaCert=await call("/api/v1/medical_certificates",{method:"POST",body:JSON.stringify({athlete_id:AT,organization_id:CLUB,type:"competitive",status:"valid",data:{diagnosi:"DIAG-ROTTA-SEGRETA",referto:"REF-ROTTA"}})});
console.log("CREA-CERT stato",creaCert.stato, JSON.stringify(creaCert.corpo).slice(0,300));
const inDb=await prisma.medicalCertificate.findFirst({where:{organization_id:CLUB}});
console.log("DB-CERT-DATA:",JSON.stringify(inDb?.data));
const patchAtl=await call(`/api/v1/athletes/${AT}`,{method:"PATCH",body:JSON.stringify({first_name:"A",data:{diagnosi:"DIAG-ATLETA-SEGRETA",allergies:"ALL-NOTA"}})});
console.log("PATCH-ATLETA stato",patchAtl.stato);
const atlDb=await prisma.athlete.findUnique({where:{id:AT}});
console.log("DB-ATLETA-DATA:",JSON.stringify(atlDb?.data));
S=(await auth.createSessionForUser(mist)).access_token; RU="trainer";
const letturaCert=await call(`/api/v1/medical_certificates?club_id=${CLUB}`);
console.log("TRAINER-CERT:",JSON.stringify(letturaCert.corpo).slice(0,500));
const letturaAtl=await call(`/api/v1/athletes/${AT}`);
console.log("TRAINER-ATLETA:",JSON.stringify(letturaAtl.corpo).slice(0,500));
} finally {
await prisma.auditLog.deleteMany({where:{organization_id:CLUB}}).catch(()=>{});
await prisma.club.delete({where:{id:CLUB}}).catch((e)=>console.error("pulizia",e.message));
await prisma.$disconnect();
}
