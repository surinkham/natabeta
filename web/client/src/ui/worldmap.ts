import { CITIES, ZONES, regionAt, zoneAt, type Region } from '@shared/regions';
import { SPAWNS } from '@shared/world';
import { ATLAS, atlasPct, fullView, paintAtlas, viewBox } from './atlas-paint';

// how to get from one town to the others: compass direction and how many maps you cross on the shortest way
const DIR8=['ตะวันออก','ตะวันออกเฉียงใต้','ใต้','ตะวันตกเฉียงใต้','ตะวันตก','ตะวันตกเฉียงเหนือ','เหนือ','ตะวันออกเฉียงเหนือ'];
const dirTo=(a:Region,b:Region)=>DIR8[(Math.round(Math.atan2(b.z-a.z,b.x-a.x)/(Math.PI/4))+8)%8];
function mapsBetween(a:string,b:string){
  const seen=new Map([[a,0]]),q=[a];
  while(q.length){const id=q.shift()!; if(id===b)return seen.get(id)!-1; for(const e of Object.values(ZONES.find(z=>z.id===id)!.exits)) if(!seen.has(e!.to)){seen.set(e!.to,seen.get(id)!+1);q.push(e!.to);}}
  return -1;
}
function route(city:Region){
  const n=ZONES.filter(z=>z.home.id===city.id&&z.terrain!=='town').length, pk=ZONES.filter(z=>z.home.id===city.id&&z.pk).length;
  const ways=CITIES.filter(c=>c.id!==city.id).map(c=>({c,n:mapsBetween(city.id,c.id)})).sort((a,b)=>a.n-b.n).slice(0,3)
    .map(({c,n})=>`<li><b>${c.realm}</b> — ทิศ${dirTo(city,c)} ผ่าน ${n} แผนที่</li>`).join('');
  return `ออกได้ทั้ง 4 ประตู · รอบเมืองมี ${n} แผนที่${pk?` (⚔ เขต PK ${pk})`:''} · หลายเส้นทางวนถึงกัน<ul class="atlas-ways">${ways}</ul>`;
}
import { MONSTERS } from '@shared/data';
import { zoneName } from '@shared/world';
import { game } from './api';
import { createWindow, toggleWindow } from './windows';
import './worldmap.css';
let panel: HTMLElement, marker: HTMLElement, status: HTMLElement;
let selected = CITIES[0].id;
function centerPanel() {
  if (!panel || panel.hidden) return;
  panel.style.transform = 'none';
  const r = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(0, Math.round((innerWidth - r.width) / 2))}px`;
  panel.style.top = `${Math.max(0, Math.round((innerHeight - r.height) / 2))}px`;
}
const colors = (c:Region) => '#'+c.color.toString(16).padStart(6,'0');
const biomeLabels = {meadow:'ทุ่งหญ้า',forest:'ป่าโบราณ',snow:'หิมะและน้ำแข็ง',desert:'ทะเลทราย',volcanic:'ภูเขาไฟ',shadow:'แดนต้องสาป'};
const appearances:Record<string,string> = {spore:'เห็ดเรืองแสงบนร่างเจล',antlers:'กิ่งเขาและมงกุฎใบไม้','ice-mane':'แผงคอผลึกน้ำแข็ง','ice-armor':'เกราะผลึกและเขี้ยวน้ำแข็ง',scarab:'กระดองทองและขาแมลงหกขา',scorpion:'ก้ามคู่และหางชูเหล็กใน',ember:'เขาเพลิงและแผ่นเกราะหินดำ',magma:'เกราะหินภูเขาไฟและแกนลาวา',shadow:'เขาโค้งและหนามคริสตัลม่วง',reaper:'มงกุฎวิญญาณและใบมีดเงา'};
const castle = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9h5v12M16 21V9h5v12M8 21V6h8v15M1 9l4-6 4 6M7 6l5-5 5 5M15 9l4-6 4 6M10 21v-5a2 2 0 014 0v5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
function selectRegion(id:string) {
  selected=id;
  const city=CITIES.find(c=>c.id===id)!;
  for(const b of panel.querySelectorAll<HTMLElement>('[data-region]')) { const active=b.dataset.region===id; b.classList.toggle('selected',active); b.setAttribute('aria-pressed',String(active)); }
  panel.querySelector<HTMLElement>('.atlas-detail')!.style.setProperty('--realm-color',colors(city));
  panel.querySelector('[data-detail]')!.innerHTML=`<span class="atlas-eyebrow">${biomeLabels[city.biome]} · Lv. ${city.levels}</span><h2>${city.realm}</h2><h3>${city.title}</h3><p class="atlas-description">${city.description}</p><div class="atlas-rule"></div><span class="atlas-eyebrow">มอนสเตอร์ประจำพื้นที่</span><div class="atlas-bestiary">${city.monsters.map(id=>{const m=MONSTERS[id];return `<div class="atlas-monster"><span class="monster-rune">${m.appearance==='scarab'||m.appearance==='scorpion'?'✦':m.appearance?.startsWith('ice')?'❄':'◆'}</span><div><strong>${m.name}</strong><small>Lv. ${m.level} · ${appearances[m.appearance??'']??'สัตว์ป่าแห่งทุ่งหญ้า'}</small></div></div>`;}).join('')}</div><div class="atlas-travel"><span>◇ การเดินทาง</span><div class="atlas-route-text">${route(city)}</div><small>ทุ่งรอบเมือง: ${city.field} · แตะแผนที่ย่อย (N) เพื่อเดินไป</small></div>`;
}
export function setupWorldMap() {
    panel=createWindow('worldmap','แผนที่โลก',`<div class="atlas-top"><div><span class="atlas-eyebrow">THE SIX REALMS</span><h1>PAWTALE KINGDOMS</h1><p>ทวีปเดียว หกอาณาจักร — เดินข้ามแผนที่ย่อยได้ทุกทิศ ผ่านทุ่ง ป่าลึก ช่องเขา และเขต PK</p></div><span class="atlas-badge">6 อาณาจักร · ${ZONES.length} แผนที่ · ⚔ ${ZONES.filter(z=>z.pk).length} เขต PK</span></div><div class="atlas-layout"><section class="atlas-map" aria-label="แผนที่หกอาณาจักร"><canvas class="atlas-canvas"></canvas>${CITIES.map(c=>`<button class="atlas-pin" data-region="${c.id}" style="left:${atlasPct(c.x,c.z)[0]}%;top:${atlasPct(c.x,c.z)[1]}%;--realm-color:${colors(c)}" aria-label="${c.title} ${c.realm}">${castle}<span>${c.title}<strong>${c.realm}</strong></span></button>`).join('')}<div class="atlas-player" aria-label="ตำแหน่งคุณ"><i></i><span>คุณอยู่ที่นี่</span></div><div class="atlas-compass"><span>N</span>✥<small>W &nbsp; E</small></div><div class="atlas-legend"><span>♜ เมือง</span><span>━ ถนน</span><span style="color:#327c91">≈ แม่น้ำ</span><span>╪ สะพาน</span><span>▲ ภูเขา</span><span style="color:#8a0f07">⚔ เขต PK</span><span style="color:#a3140a">♛ บอส</span><span>● คุณ</span></div></section><aside class="atlas-detail"><div data-detail></div></aside></div><nav class="atlas-region-list" aria-label="เลือกอาณาจักร">${CITIES.map((c,i)=>`<button data-region="${c.id}" style="--realm-color:${colors(c)}"><small>0${i+1} · ${biomeLabels[c.biome]}</small><strong>${c.realm}</strong><span>Lv. ${c.levels}</span></button>`).join('')}</nav><footer class="atlas-footer"><span data-status></span><span>เลือกอาณาจักรเพื่อดูรายละเอียด · ลากเพื่อเลื่อน · ล้อเมาส์ / + − ซูม · M / Esc ปิด</span></footer>`);
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','แผนที่โลกหกอาณาจักร');
  { const m=panel.querySelector<HTMLElement>('.atlas-map')!; m.style.aspectRatio=`${ATLAS.w} / ${ATLAS.h}`; m.style.setProperty('--atlas-r',String(ATLAS.w/ATLAS.h)); } bindZoom();
  panel.querySelector('header')!.addEventListener('pointerdown',e=>e.stopImmediatePropagation(),true);
  marker=panel.querySelector('.atlas-player')!;status=panel.querySelector('[data-status]')!;
  for(const button of panel.querySelectorAll<HTMLElement>('[data-region]')) button.addEventListener('click',()=>selectRegion(button.dataset.region!));
  selectRegion(selected);
  panel.addEventListener('win:open',()=>{requestAnimationFrame(centerPanel);selectRegion(regionAt(game().P).id);paint();refreshWorldMap();});
  addEventListener('resize',()=>requestAnimationFrame(centerPanel));

  const button=document.createElement('button'); button.textContent='แผนที่โลก [M]';button.title='สำรวจหกอาณาจักร';button.className='mapbtn';
  document.getElementById('mmc')!.parentElement!.appendChild(button);button.addEventListener('click',()=>toggleWindow('worldmap'));
  addEventListener('keydown',e=>{if(e.code==='KeyM'&&!e.repeat&&!(e.target instanceof HTMLElement&&e.target.closest('input,textarea,[contenteditable="true"]'))){e.preventDefault();toggleWindow('worldmap');}});
}
// zoom (wheel, + / −) and drag to pan; ⌂ shows the whole continent again. The atlas is repainted for the view (it is
// drawn, not an image, so it stays sharp), at most once a frame.
const view=fullView(); let painted='', queued=false;
function paint(){
  const cv=panel.querySelector<HTMLCanvasElement>('.atlas-canvas')!, dpr=Math.min(devicePixelRatio,2), w=Math.round(cv.clientWidth*dpr);
  const key=`${w}|${view.cx.toFixed(1)}|${view.cz.toFixed(1)}|${view.zoom}`; if(!w||key===painted)return; painted=key;
  cv.width=w; cv.height=Math.round(w*ATLAS.h/ATLAS.w);
  const bosses=new Map<string,number>(); for(const s of SPAWNS) if(s.zone) bosses.set(s.zone,(bosses.get(s.zone)??0)+1);
  paintAtlas(cv,bosses,view);
  for(const pin of panel.querySelectorAll<HTMLElement>('.atlas-pin')){ const c=CITIES.find(c=>c.id===pin.dataset.region)!, [l,t]=atlasPct(c.x,c.z,view); pin.style.left=`${l}%`; pin.style.top=`${t}%`; pin.hidden=l<-2||l>102||t<-2||t>102; }
  refreshWorldMap();
}
const repaint=()=>{ if(queued)return; queued=true; requestAnimationFrame(()=>{queued=false;paint();}); };
function zoomAt(f:number, fx=0.5, fy=0.5){
  const before=viewBox(view), wx=before.x0+before.w*fx, wz=before.z0+before.h*fy;
  view.zoom=Math.max(1,Math.min(5,view.zoom*f)); const after=viewBox(view);
  view.cx+=wx-(after.x0+after.w*fx); view.cz+=wz-(after.z0+after.h*fy); repaint();   // keep the point under the cursor still
}
function bindZoom(){
  const map=panel.querySelector<HTMLElement>('.atlas-map')!;
  map.insertAdjacentHTML('beforeend','<div class="atlas-zoom"><button data-z="in" title="ซูมเข้า">+</button><button data-z="out" title="ซูมออก">−</button><button data-z="home" title="ทั้งทวีป">⌂</button></div>');
  map.querySelector('.atlas-zoom')!.addEventListener('click',e=>{const z=(e.target as HTMLElement).closest<HTMLElement>('[data-z]')?.dataset.z; if(z==='in')zoomAt(1.4); if(z==='out')zoomAt(1/1.4); if(z==='home'){Object.assign(view,fullView());repaint();}});
  map.addEventListener('wheel',e=>{e.preventDefault(); const r=map.getBoundingClientRect(); zoomAt(e.deltaY<0?1.2:1/1.2,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);},{passive:false});
  let drag:{x:number;y:number;cx:number;cz:number}|null=null;
  map.addEventListener('pointerdown',e=>{if((e.target as HTMLElement).closest('button'))return; drag={x:e.clientX,y:e.clientY,cx:view.cx,cz:view.cz}; map.setPointerCapture(e.pointerId);});
  map.addEventListener('pointermove',e=>{if(!drag)return; const vb=viewBox(view), r=map.getBoundingClientRect(); view.cx=drag.cx-(e.clientX-drag.x)*vb.w/r.width; view.cz=drag.cz-(e.clientY-drag.y)*vb.h/r.height; repaint();});
  map.addEventListener('pointerup',()=>{drag=null;});
}
export function refreshWorldMap() {
  if(!panel||panel.hidden)return;
  const p=game().P,c=regionAt(p);
  const [l,t]=atlasPct(p.x,p.z,view); marker.style.left=`${l}%`; marker.style.top=`${t}%`; marker.hidden=l<0||l>100||t<0||t>100;
  status.textContent=`● ${zoneAt(p).name} (${zoneName(p)}) · ${c.realm}`;
}
