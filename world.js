import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const ROADS = [-120, -60, 0, 60, 120];
export const clamp = THREE.MathUtils.clamp;
export const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
export const angleDifference = (a,b) =>
Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function seededRandom(seed=18467) {
return () => {
seed |= 0;
seed = seed + 0x6D2B79F5 | 0;
let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
}
export class World {
constructor(scene) {
this.scene=scene;
this.random=seededRandom();
this.materials={};
this.batches=new Map();
this.chunks=[];
this.colliders=[];
this.surfaces=[];
this.interactions=[];
this.doors=[];
this.lamps=[];
this.mapBuildings=[];
const material=(name,color,roughness=.85,metalness=0)=>{
const m=new THREE.MeshStandardMaterial({color,roughness,metalness});
this.materials[name]=m;
return m;
};
material('road',0x303941,.94);
material('pavement',0xb3afa3);
material('sand',0xe0c598);
material('grass',0x527b64);
material('pink',0xe1a0ad);
material('mint',0x85bdb0);
material('cream',0xe5cba6);
material('blue',0x829ab7);
material('white',0xe4dfd0);
material('dark',0x1b2b35);
material('wood',0x8f6f57);
material('leaf',0x367859);
material('trunk',0x99816a);
material('orange',0xd6a05f);
material('metal',0x697e86,.45,.6);
material('glass',0x416978,.25,.45);
this.windowMaterial=material('window',0x537584,.3,.35);
this.windowMaterial.emissive.setHex(0xffcf99);
this.lampMaterial=material('lamp',0xffe1b2);
this.lampMaterial.emissive.setHex(0xffc184);
this.neonMaterial=material('neon',0x9addc6);
this.neonMaterial.emissive.setHex(0x6bdfbb);
this.neonMaterial.emissiveIntensity=1.5;
this.signalMaterials=[0,1].map(()=>new THREE.MeshStandardMaterial({
color:0x22313b,emissive:0x35eb8a,emissiveIntensity:2
}));
this.build();
this.flush();
}
batch(material,geometry,x,z) {
const m=typeof material==='string'?this.materials[material]:material;
const cx=Math.floor(x/60),cz=Math.floor(z/60);
const key=`${m.uuid}:${cx}:${cz}`;
if(!this.batches.has(key))
this.batches.set(key,{m,cx,cz,geometries:[]});
this.batches.get(key).geometries.push(geometry);
}
box(material,x,y,z,w,h,d,solid=false) {
this.batch(material,new THREE.BoxGeometry(w,h,d).translate(x,y,z),x,z);
if(solid)this.collider(x,z,w,d,y-h/2,y+h/2);
}
collider(x,z,w,d,minY=0,maxY=30,enabled=()=>true) {
const c={x,z,w,d,minY,maxY,enabled};
this.colliders.push(c);
return c;
}
blocked(x,z,r=.35,y=0,height=1.7) {
if(x<-154+r||x>176-r||z<-154+r||z>154-r)return true;
for(const c of this.colliders) {
if(!c.enabled()||y>=c.maxY-.025||y+height<=c.minY+.025)continue;
const qx=clamp(x,c.x-c.w/2,c.x+c.w/2);
const qz=clamp(z,c.z-c.d/2,c.z+c.d/2);
if((x-qx)**2+(z-qz)**2<r*r)return true;
}
return false;
}
clearLine(a,b,y=1.2) {
const steps=Math.ceil(distance(a,b)/.5);
for(let i=1;i<steps;i++) {
const t=i/steps;
if(this.blocked(
a.x+(b.x-a.x)*t,
a.z+(b.z-a.z)*t,
.03,y,.1
))return false;
}
return true;
}
floor(x,z) {
let h=0;
for(const s of this.surfaces) {
if(Math.abs(x-s.x)<=s.w/2&&Math.abs(z-s.z)<=s.d/2)
h=Math.max(h,s.height(x,z));
}
return h;
}
sign(text,x,y,z,color='#bddfcf',width=12) {
const canvas=document.createElement('canvas');
canvas.width=768;canvas.height=160;
const ctx=canvas.getContext('2d');
ctx.fillStyle='#14232e';
ctx.fillRect(0,0,768,160);
ctx.strokeStyle=color;
ctx.lineWidth=5;
ctx.strokeRect(7,7,754,146);
ctx.fillStyle=color;
ctx.textAlign='center';
ctx.textBaseline='middle';
ctx.font='bold 58px sans-serif';
ctx.fillText(text,384,82,725);
const texture=new THREE.CanvasTexture(canvas);
texture.colorSpace=THREE.SRGBColorSpace;
const mesh=new THREE.Mesh(
new THREE.PlaneGeometry(width,width*160/768),
new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide})
);
mesh.position.set(x,y,z);
this.scene.add(mesh);
return mesh;
}
palm(x,z,scale=1) {
const h=6.7*scale;
const trunk=new THREE.CylinderGeometry(.13*scale,.27*scale,h,6);
trunk.translate(x,h/2,z);
this.batch('trunk',trunk,x,z);
for(let i=0;i<8;i++) {
const a=i*Math.PI/4;
const leaf=new THREE.ConeGeometry(.65*scale,4.3*scale,3);
leaf.rotateZ(Math.PI/2);
leaf.rotateY(a);
leaf.translate(
x+Math.cos(a)*1.65*scale,
h-.15,
z-Math.sin(a)*1.65*scale
);
this.batch('leaf',leaf,x,z);
}
this.collider(x,z,.35,.35,0,h);
}
building(x,z,w,d,h,color,label=null) {
this.box(color,x,h/2,z,w,h,d,true);
this.mapBuildings.push({x,z,w,d});
this.box('white',x,h+.18,z,w+.6,.36,d+.6);
this.box('dark',x,h+.75,z,w*.45,1.1,d*.4);
for(let y=2.1;y<h-1;y+=3.4) {
for(let xx=x-w/2+1.6;xx<x+w/2-1;xx+=3.3) {
if(this.random()<.16)continue;
this.box(this.windowMaterial,xx,y,z+d/2+.03,1.35,1.65,.06);
this.box(this.windowMaterial,xx,y,z-d/2-.03,1.35,1.65,.06);
}
for(let zz=z-d/2+1.6;zz<z+d/2-1;zz+=3.3) {
this.box(this.windowMaterial,x+w/2+.03,y,zz,.06,1.65,1.35);
this.box(this.windowMaterial,x-w/2-.03,y,zz,.06,1.65,1.35);
}
}
if(label) {
this.box('white',x,2.9,z+d/2+.7,w,.18,1.6);
this.sign(label,x,3.8,z+d/2+.12,'#e8a9bd',Math.min(w-1,13));
}
// Stepped architectural trim and occasional balconies.
if(h>12) {
this.box(color,x,h+1.2,z,w*.7,2,d*.75);
this.box('white',x,h+2.3,z,w*.72,.22,d*.77);
}
if(h>7&&this.random()>.5) {
this.box('white',x,5.2,z+d/2+.8,w*.7,.2,1.8);
this.box('mint',x,5.65,z+d/2+1.65,w*.7,.7,.12);
}
}
makeDoor(x,z) {
const pivot=new THREE.Group();
pivot.position.set(x-2,0,z);
const mesh=new THREE.Mesh(
new THREE.BoxGeometry(4,3.2,.16),
new THREE.MeshStandardMaterial({
color:0x509a9c,roughness:.35,metalness:.35
})
);
mesh.position.set(2,1.6,0);
mesh.castShadow=true;
pivot.add(mesh);
this.scene.add(pivot);
const door={
id:'depotDoor',type:'door',x,z,
label:'Open depot door',open:false,angle:0,pivot
};
this.doors.push(door);
this.interactions.push(door);
this.collider(x,z,4,.2,0,3.3,()=>!door.open);
}
depot() {
const x=90,z=-90,w=30,d=22,h=6;
this.box('pavement',x,.025,z,w,.05,d);
this.box('mint',x,h/2,z-11,w,h,.5,true);
this.box('mint',75,h/2,z,.5,h,d,true);
this.box('mint',105,h/2,z,.5,h,d,true);
this.box('cream',81.5,h/2,-79,13,h,.5,true);
this.box('cream',98.5,h/2,-79,13,h,.5,true);
this.box('cream',90,4.6,-79,4,2.8,.5,true);
this.box('dark',90,6.15,-90,31,.3,23);
this.makeDoor(90,-79);
this.sign('MARLIN EXCHANGE',90,4.7,-78.65,'#a3decc',22);
this.box('wood',80,1,-96,3,2,3,true);
this.box('wood',99,1,-95,4,2,3,true);
this.box('dark',90,.7,-94,3.5,1.4,1.7,true);
this.caseMesh=new THREE.Mesh(
new THREE.BoxGeometry(.8,.5,.6),this.neonMaterial
);
this.caseMesh.position.set(90,1.65,-93.9);
this.scene.add(this.caseMesh);
this.interactions.push({
id:'case',type:'case',x:90,z:-92,
label:'Inspect sealed case'
});
this.box('metal',102,1.3,-83,.3,.6,.5);
this.interactions.push({
id:'power',type:'switch',x:102,z:-82,
label:'Operate depot power switch'
});
this.interiorLight=new THREE.PointLight(0xa5e7d2,75,24,2);
this.interiorLight.position.set(90,4.5,-90);
this.scene.add(this.interiorLight);
this.box('road',90,.02,-70,33,.04,16);
this.mapBuildings.push({x,z,w,d});
}
rooftop() {
this.building(-90,30,24,22,4,'pink','SOL TERRACE');
this.surfaces.push({
x:-90,z:30,w:24,d:22,height:()=>4.25
});
// Staircase outside the east wall; the upper landing connects to the roof.
this.surfaces.push({
x:-73.5,z:32,w:6,d:26,
height:(_x,z)=>clamp((45-z)/26,0,1)*4.25
});
for(let i=0;i<26;i++) {
const h=(i+1)*4.25/26;
this.box('pavement',-73.5,h/2,44.5-i,6,h,1);
}
this.box('pavement',-77,4.13,21,13,.24,4);
this.surfaces.push({
x:-77,z:21,w:13,d:4,height:()=>4.25
});
this.box('white',-101.8,4.65,30,.2,.8,22);
this.box('white',-90,4.65,19.2,24,.8,.2);
this.sign('ROOFTOP ACCESS',-73.5,1.8,47,'#e4c69c',8);
this.terminal(
'transmitter',-94,4.25,29,
'Inspect rooftop transmitter'
);
}
terminal(id,x,y,z,label) {
this.box('metal',x,y+.65,z,.9,.9,.6);
this.box(this.neonMaterial,x,y+.8,z+.31,.6,.25,.025);
this.box('metal',x+.3,y+1.6,z,.025,1.2,.025);
this.interactions.push({id,type:'terminal',x,y,z:z+1,label});
}
gasStation() {
this.box('road',90,.015,90,46,.03,45);
this.box('cream',90,4.6,84,27,.45,16);
this.box('pink',90,4.9,84,28,.25,17);
for(const x of [79,101])
this.box('mint',x,2.3,84,.4,4.6,.4,true);
for(const x of [84,96]) {
this.box('cream',x,1,84,1,2,.8,true);
this.box('dark',x,1.3,84.42,.7,.4,.04);
}
this.sign('TIDAL FUEL',90,5.1,92.7,'#b1e5d0',21);
this.building(90,105,27,9,4.5,'cream','NIGHT MARKET');
this.interactions.push({
id:'shop',type:'shop',x:90,z:111,
label:'Night Market · refreshments $25'
});
this.sign('REPAIRS / $100',76,2,98,'#e7c48f',8);
this.interactions.push({
id:'repair',type:'repair',x:76,z:99,
label:'Repair nearest vehicle · $100'
});
}
build() {
this.box('sand',15,-.5,0,370,1,340);
this.box('grass',0,-.035,0,307,.06,307);
for(const r of [...ROADS,-145,145]) {
const outer=Math.abs(r)===145;
this.box('pavement',r,.0,0,outer?17:21,.06,306);
this.box('road',r,.045,0,outer?13:14,.04,306);
this.box('pavement',0,.0,r,306,.06,outer?17:21);
this.box('road',0,.047,r,306,.04,outer?13:14);
for(let n=-138;n<145;n+=10) {
if(ROADS.some(v=>Math.abs(v-n)<11))continue;
this.box('cream',r,.074,n,.1,.008,4);
this.box('cream',n,.076,r,4,.008,.1);
}
}
const labels=[
'LAGO HOTEL','CASA AZUL','PEARL RECORDS',
'ORBIT DINER','RADIO SOL','CORAL SUITES',
'MIRA CAFE','ESTRELLA'
];
let label=0;
for(let ix=0;ix<4;ix++)for(let iz=0;iz<4;iz++) {
const x=ROADS[ix]+30,z=ROADS[iz]+30;
if(x===90&&z===-90){this.depot();continue;}
if(x===-90&&z===30){this.rooftop();continue;}
if(x===90&&z===90){this.gasStation();continue;}
if(x===-90&&z===90) {
this.box('grass',x,.03,z,43,.06,43);
this.box('pavement',x,.075,z,4,.06,45);
this.box('pavement',x,.077,z,45,.06,4);
for(const [dx,dz] of [
[-17,-17],[17,-17],[-17,17],[17,17],[-10,7],[12,-9]
])this.palm(x+dx,z+dz,.9);
this.terminal('community',-90,0,98,'Use community relay');
this.sign('PALOMA PARK',-90,2,113,'#b9dfbf',15);
continue;
}
if(x===90&&z===-30) {
for(let i=0;i<3;i++) {
this.box(i%2?'mint':'orange',76+i*14,2.1,-30,10,4.2,29,true);
for(let k=0;k<8;k++)
this.box('dark',76+i*14,2.2,-43+k*3.8,10.1,.09,.1);
}
this.box('metal',109,10,-35,.8,20,.8,true);
this.box('orange',93,19,-35,34,.8,.8);
this.sign('EAST DOCKS',90,3,-12,'#e9c594',18);
continue;
}
for(let a=0;a<2;a++)for(let b=0;b<2;b++) {
const bx=x+(a?10:-10),bz=z+(b?10:-10);
const downtown=Math.abs(x)<60&&z<0;
const h=downtown?15+this.random()*32:5+this.random()*9;
const colors=['pink','mint','cream','blue','white'];
this.building(
bx,bz,14+this.random()*2,14+this.random()*2,h,
colors[Math.floor(this.random()*colors.length)],
!a&&b?labels[label++%labels.length]:null
);
}
}
this.box('sand',164,.015,0,31,.03,308);
this.box('wood',158,.08,0,4,.16,295);
for(let z=-135;z<=135;z+=22) {
this.palm(154,z,1.05);
this.box('wood',160,.55,z,2.2,.13,.6);
this.box('metal',159.2,.25,z,.1,.5,.5);
this.box('metal',160.8,.25,z,.1,.5,.5);
const x=169+(Math.abs(z)%3);
this.box('white',x,1.2,z,.045,2.4,.045);
for(let i=0;i<10;i++) {
const g=new THREE.ConeGeometry(
1.65,.6,1,1,true,i*Math.PI/5,Math.PI/5
);
g.translate(x,2.4,z);
this.batch(i%2?'cream':'pink',g,x,z);
}
this.box('mint',x,.3,z+2,.8,.13,1.9);
}
for(const road of ROADS)for(let z=-133;z<140;z+=25) {
if(ROADS.some(v=>Math.abs(v-z)<12))continue;
const side=(Math.floor(z/25)%2)?1:-1;
const x=road+side*9;
this.box('dark',x,3.2,z,.12,6.4,.12);
this.box('dark',x-side*.9,6.4,z,1.9,.1,.1);
this.box(this.lampMaterial,x-side*1.6,6.3,z,.55,.1,.35);
this.lamps.push(new THREE.Vector3(x-side*1.6,6,z));
if(this.random()<.35)
this.box('dark',x,.42,z+2,.55,.84,.55,true);
}
for(const x of ROADS)for(const z of ROADS) {
this.box('dark',x+8.7,2.6,z+8.7,.1,5.2,.1);
this.box(this.signalMaterials[0],x+8.7,5,z+7.8,.25,.5,.3);
this.box(this.signalMaterials[1],x+7.8,5,z+8.7,.3,.5,.25);
}
// Payphone and pickup near spawn.
this.box('mint',10,1.15,22,.65,2.3,.6);
this.sign('CALL',10,2.6,22.35,'#b8e7d1',2.6);
this.interactions.push({
id:'phone',type:'phone',x:10,z:23,
label:'Use boulevard payphone'
});
const med=new THREE.Mesh(
new THREE.BoxGeometry(.5,.4,.5),
new THREE.MeshStandardMaterial({
color:0xf0e1d1,emissive:0x4e211f,emissiveIntensity:.4
})
);
med.position.set(-10,.5,35);
this.scene.add(med);
this.interactions.push({
id:'medkit',type:'pickup',x:-10,z:35,
label:'Take first-aid kit',used:false,mesh:med
});
this.interactions.push({
id:'directory',type:'sign',x:10,z:45,
label:'Read district directory',
text:'MARLIN: northeast. SOL TERRACE: west. TIDAL FUEL: southeast. '+
'Paloma Park’s relay operates after dark.'
});
this.sign('CITY DIRECTORY',10,1.8,44.5,'#dcc4a2',5);
this.sign('PALM STATIC / 103.8',-30,12,135,'#e6a9c0',25);
this.box('dark',-39,6,135,.25,12,.25);
this.box('dark',-21,6,135,.25,12,.25);
this.sign('PARADISE HAS A WATERLINE',90,8,110,'#c2dfd0',25);
// Construction on the western fringe.
for(let i=0;i<8;i++) {
this.box('orange',-134,.45,-92+i*4,.55,.9,.55,true);
this.box('white',-134,.52,-92+i*4,.57,.15,.57);
}
// Low bridge along the outer road.
this.box('glass',-40,.005,145,34,.01,25);
this.box('road',-40,.06,145,36,.12,13);
this.box('white',-40,.65,152,36,1.2,.2,true);
this.box('white',-40,.65,138,36,1.2,.2,true);
const seaGeometry=new THREE.PlaneGeometry(800,1100,35,40);
seaGeometry.rotateX(-Math.PI/2);
this.water=new THREE.Mesh(
seaGeometry,
new THREE.MeshStandardMaterial({
color:0x267d87,roughness:.22,metalness:.48
})
);
this.water.position.set(578,-.2,0);
this.scene.add(this.water);
this.waterBase=new Float32Array(seaGeometry.attributes.position.array);
this.waterTick=0;
for(let i=0;i<9;i++) {
const g=new THREE.SphereGeometry(1,12,8);
g.scale(40+this.random()*30,25+this.random()*25,40);
g.translate(-213-this.random()*30,-12,-190+i*48);
this.batch('grass',g,-213,-190+i*48);
}
this.roadblock=new THREE.Mesh(
new THREE.BoxGeometry(7,.8,.65),this.materials.orange
);
this.roadblock.position.set(-120,.6,60);
this.roadblock.visible=false;
this.scene.add(this.roadblock);
this.collider(-120,60,7,.65,0,1.1,()=>this.roadblock.visible);
}
flush() {
for(const batch of this.batches.values()) {
const geometry=mergeGeometries(batch.geometries,false);
for(const g of batch.geometries)g.dispose();
if(!geometry)throw new Error('Static geometry batching failed.');
const mesh=new THREE.Mesh(geometry,batch.m);
mesh.castShadow=batch.m!==this.windowMaterial;
mesh.receiveShadow=true;
mesh.userData.center={x:batch.cx*60+30,z:batch.cz*60+30};
this.scene.add(mesh);
this.chunks.push(mesh);
}
this.batches.clear();
}
reset() {
for(const door of this.doors)door.open=false;
for(const item of this.interactions) {
if(item.type==='pickup') {
item.used=false;
item.mesh.visible=true;
}
}
this.interiorLight.intensity=75;
this.caseMesh.visible=true;
this.roadblock.visible=false;
}
update(dt,game) {
const {time,weather,player}=game;
this.windowMaterial.emissiveIntensity=.025+time.night*.95;
this.lampMaterial.emissiveIntensity=.1+time.night*2.8;
this.neonMaterial.emissiveIntensity=.55+time.night*1.2;
this.materials.road.roughness=.94-weather.wet*.7;
this.materials.road.metalness=.04+weather.wet*.32;
for(let i=0;i<2;i++)
this.signalMaterials[i].emissive.setHex(
time.green(i)?0x45ed9b:0xf14c57
);
for(const door of this.doors) {
door.angle=THREE.MathUtils.damp(
door.angle,door.open?1.6:0,7,dt
);
door.pivot.rotation.y=door.angle;
door.label=door.open?'Close depot door':'Open depot door';
}
this.waterTick+=dt;
if(this.waterTick>.08) {
this.waterTick=0;
const positions=this.water.geometry.attributes.position;
for(let i=0;i<positions.array.length;i+=3) {
positions.array[i+1]=
Math.sin(this.waterBase[i]*.08+time.elapsed*.65)*.17+
Math.cos(this.waterBase[i+2]*.095+time.elapsed*.5)*.1;
}
positions.needsUpdate=true;
}
for(const chunk of this.chunks)
chunk.visible=distance(chunk.userData.center,player)<300;
}
snapshot() {
return {
doors:this.doors.map(d=>d.open),
pickups:this.interactions.filter(i=>i.type==='pickup').map(i=>i.used),
power:this.interiorLight.intensity>10
};
}
restore(s={}) {
this.doors.forEach((door,i)=>door.open=!!s.doors?.[i]);
this.interactions.filter(i=>i.type==='pickup').forEach((item,i)=>{
item.used=!!s.pickups?.[i];
item.mesh.visible=!item.used;
});
this.interiorLight.intensity=s.power?75:5;
}
}
