import { ITEMS, MONSTERS } from '@shared/data';
import { themeOf,PALETTES,hex,insignia } from './style';
const cache=new Map<string,string>();
/** Inventory art is code-native SVG: silhouettes stay legible at 32 px, with no emoji fallback for catalog items. */
export function itemIcon(id:string):string|undefined {
 const d=ITEMS[id];if(!d)return;const cached=cache.get(id);if(cached)return cached;
 const theme=themeOf(id),[a,b,c]=PALETTES[theme].map(hex),ink='#17212d';
 const path=(v:string,fill=a,stroke=ink,w=1.6)=>`<path d="${v}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
 const line=(v:string,color=c,w=2)=>path(v,'none',color,w);
 const gem=(x:number,y:number,r=4,color=c)=>path(`M${x} ${y-r}L${x+r*.7} ${y} ${x} ${y+r} ${x-r*.7} ${y}Z`,color);
 const circle=(x:number,y:number,r:number,fill:string,stroke=ink)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
 const motif=theme==='frost'?line('M24 14V30M17 18L31 26M17 26L31 18',c,1.7):theme==='ember'?path('M24 30Q16 25 23 19L24 14Q32 22 27 27Z',c):theme==='moon'||theme==='void'?path('M28 15A8 8 0 1 0 29 29A9 9 0 0 1 28 15Z',c):theme==='grove'?path('M19 28Q14 14 29 16Q32 26 19 28Z',c):gem(24,23,6);
 let art='';
 if(d.weapon==='sword'){
  const profile=theme==='fang'?'M21 31Q18 15 30 5L33 3Q32 20 26 33Z':theme==='frost'?'M21 32L18 22L22 23L21 12L28 3L32 16L29 16L30 26L26 32Z':theme==='ember'?'M20 32L19 22L23 24L21 15L26 17L29 3L33 17L30 23L32 26L26 32Z':id==='ALPHA_FANG_BLADE'?'M18 32L17 19L21 20L21 10L28 2L35 16L31 30L26 34Z':'M21 32L21 9L25 3L29 9L27 32Z';
  art=`<g transform="rotate(28 24 24)">${path(profile)}${line('M25 10L24 30',c,1.8)}${path('M14 31L21 29L28 29L34 32L32 35L25 33L17 35Z',c)}${path('M21 34H27V43H21Z',b)}${line('M22 36L26 38M22 39L26 41',c,1)}${gem(24,44,2.5)}</g>`;
 }else if(d.weapon==='bow'){
  const long=id==='LONGBOW';art=path(long?'M13 4Q39 24 13 44L17 39Q32 24 17 9Z':'M13 5L21 10Q35 24 21 38L13 43L18 32Q26 24 18 16Z')+line('M13 5L13 43','#e5dfc6',1)+line('M7 29L37 15',c,1.8)+path('M40 13L33 14L37 20Z',c)+path('M18 21L25 21L25 27L18 27Z',b);
  if(theme==='storm')art+=path('M27 9L21 20L27 19L24 31L34 17L28 18L33 8Z',c);
  if(theme==='grove')art+=path('M21 14Q20 4 30 7Q30 15 21 14ZM23 34Q33 30 33 40Q23 42 23 34Z',c);
  if(id==='GEAR_MEADOW')art+=circle(26,9,3,'#ffd56c');
 }else if(d.weapon==='staff'){
  art=`<g transform="rotate(24 24 24)">${path('M22 20H26L25 45H21Z',b)}${line('M21 33H26M21 39H25',c,2)}`;
  if(theme==='void')art+=circle(24,14,10,b,c)+circle(24,14,7,ink,c)+gem(24,14,6)+path('M14 17L10 7L18 10M34 17L39 7L31 10',a);
  else if(theme==='ember')art+=path('M24 25Q9 16 19 8L21 16L26 2L30 12L34 8Q39 22 24 25Z',a)+path('M24 22Q19 18 24 10Q32 18 24 22Z','#ffb448');
  else if(id==='APPRENTICE_STAFF')art+=path('M22 24Q34 17 30 8Q23 1 17 9Q13 15 20 18L20 14Q17 8 24 9Q30 15 22 19Z','#b48b62')+gem(24,15,4);
  else art+=circle(24,14,10,'none',c)+path('M17 23L12 13L17 17L24 24L31 17L36 13L31 23Z',a)+gem(24,13,8);
  if(id==='GEAR_ECLIPSE')art+=circle(24,14,13,'none','#f2ce79');art+='</g>';
 }else if(d.slot==='OffHand'){
  art=path(id==='TOWER_SHIELD'?'M10 5H38L40 34L32 44H16L8 34Z':'M24 3L40 10L37 29Q32 38 24 44Q16 38 11 29L8 10Z',b,c,2.5);
  art+=id==='TOWER_SHIELD'?path('M20 9H28V17H35V24H28V37H20V24H13V17H20Z',a):motif;
 }else if(d.slot==='Chest'){
  const robe=/MAGE|GROVE/.test(id);art=path(robe?'M16 5L8 12L5 24L13 25L10 43H38L35 25L43 24L40 12L32 5L24 10Z':'M15 6L5 12L7 23L14 21L13 37L24 43L35 37L34 21L41 23L43 12L33 6L24 11Z');
  art+=line(robe?'M24 12V42M15 36H33':'M15 13L24 18L33 13M15 32L24 36L33 32',c,2)+motif;
  if(/LEATHER/.test(id))art+=line('M14 10L33 35',b,4);
  if(/GEAR_GLACIER/.test(id))art+=path('M7 16L5 4L15 10M41 16L43 4L33 10',c);
 }else if(d.slot==='Head'){
  if(/SAND|DUNE/.test(id))art=path('M8 38V19Q9 3 24 4Q40 4 40 20V39L32 34L30 21L18 21L16 34Z')+path('M14 29Q24 34 34 29L34 38H14Z',b)+gem(24,14,4);
  else if(/LEATHER/.test(id))art=path('M9 29V19Q9 7 24 7Q39 7 39 19V30L33 26H15Z')+line('M24 8V25M10 25H38',c,2)+circle(13,27,2,c)+circle(35,27,2,c);
  else art=path('M9 36V19Q9 8 24 8Q39 8 39 19V36L29 42H19Z')+path('M13 22H35V28H13Z',b)+line('M17 23V27M23 23V27M29 23V27',c,1.5)+path('M22 11L20 3L29 2L27 11Z','#ba4e45')+line('M10 19H38',c,2);
 }else if(d.slot==='Back'){
  const shape=/SHADOW/.test(id)?'M15 5H33L42 42L31 36L25 44L18 36L6 42Z':/(?:^|_)NIGHT_/.test(id)?'M15 5H33L43 38L34 33L30 42L24 36L18 42L14 33L5 38Z':/FUR/.test(id)?'M15 5L19 8L24 4L29 8L33 5L38 15L35 20L42 40L33 43L24 40L15 43L6 40L13 20L10 15Z':'M15 5H33L39 41L24 44L9 41Z';
  art=path(shape,b,c,2)+line('M17 9L14 38M31 9L34 38',a,2)+motif;
  if(/GUILD/.test(id))art+=path('M17 15L16 9L22 12L24 7L26 12L32 9L31 15Z',c);
 }else if(d.slot==='Gloves'){
  art=path('M14 42L12 27L6 21L11 17L15 21L14 9L20 7L24 9L28 7L34 10L36 26L33 42Z')+line('M15 30H34M21 10V24M28 10V24',b,2)+gem(25,33,5);
  if(theme==='ember')art+=path('M15 18L11 7L20 12L23 4L28 12L34 6L34 18Z',c);
 }else if(d.slot==='Boots'){
  art=path(/RANGER/.test(id)?'M14 4H31L29 27L41 33V40H11L12 26Z':'M13 8H30V27L41 33V41H10V34L14 26Z')+path('M10 37H41V43H10Z',b)+line('M16 17H27M16 22H27M16 27H26',c,2);
  if(/KNIGHT/.test(id))art+=path('M17 10H27L25 30L20 33L16 29Z',c);
 }else if(d.type==='Consumable'){
  const mana=/MANA|MP/.test(id),greater=/GREATER/.test(id),high=/HI_/.test(id),elixir=id==='ELIXIR',liquid=elixir?'#65deb5':mana?'#64adff':'#ef6972';
  const outline=greater?'M18 5H30V14L39 24L36 41H12L9 24L18 14Z':high?'M18 5H30V14Q43 21 37 37Q24 47 11 37Q5 21 18 14Z':elixir?'M19 4H29V14L37 25L24 44L11 25L19 14Z':'M19 5H29V15Q39 20 36 36Q24 44 12 36Q9 20 19 15Z';
  art=path(outline,'#bcd9e1')+path(greater?'M12 26H36L33 38H15Z':elixir?'M15 26H33L24 39Z':'M14 25H34L32 35Q24 40 16 35Z',liquid)+path('M17 4H31V10H17Z','#b7945b')+line('M16 21L15 27','#ffffff',2)+ (mana?gem(24,29,4,'#d8eeff'):line('M24 25V33M20 29H28','#fff1dc',2.5));
  if(greater)art+=path('M16 16L24 19L32 16L30 22H18Z','#e7bf69');
 }else if(d.type==='Book'||d.type==='Scroll'||/SCROLL/.test(id)){
  art=d.type==='Book'?path('M10 7L34 4L39 9V41L13 44L8 39V11Z',b)+path('M13 10L35 7V37L13 40Z',a)+line('M14 40L34 38M14 42L34 40','#e9dbb6',1):path('M11 6H35L38 12L33 17L35 37L31 43H12L10 37L15 31L13 14L8 12Z','#decba0')+line('M14 12H32M17 35H30',b,2);
  art+=motif;
 }else{
  const special:Record<string,string>={
   WOLF_FANG:path('M14 6Q32 3 32 14Q28 30 14 43Q21 21 14 6Z','#eadbb6'),
   ALPHA_FANG:path('M11 5L30 4Q40 23 13 44Q23 27 11 5Z','#d8e2ef')+line('M17 11L29 13',c),
   MOON_FANG:path('M14 4Q42 15 17 43Q26 24 14 4Z','#c9dcf7')+circle(25,12,3,'#ffeba8'),
   BOAR_TUSK:path('M10 13Q14 41 31 28Q38 23 39 8Q45 37 26 42Q6 40 6 17Z','#e3d1a7'),
   BEAR_CLAW:path('M8 14L14 7Q22 26 13 40L11 24Z M20 10L26 5Q34 24 25 42L23 24Z M31 13L37 8Q44 25 35 37L34 25Z','#cfb78f'),
   SHROOM_CAP:path('M20 25H29L32 42H16Z','#e8d6b1')+path('M5 27Q7 4 25 5Q41 8 44 27Z','#c35d59')+circle(17,17,3,'#f6dca7')+circle(32,20,4,'#f6dca7'),
   SLIME_JELLY:path('M6 32Q9 22 17 21Q12 3 25 7Q35 14 33 24Q46 27 40 37Q23 46 6 32Z','#65caae')+line('M18 29Q21 24 26 28','#d6ffdf'),
   HEART_WOOD:path('M11 10L30 5L40 34L21 42Z','#875b3c')+path('M11 10L21 36L21 42L7 17Z','#c39764')+line('M22 15Q35 22 27 30M17 12L26 37','#c8a06a'),
   BAT_WING:path('M24 17L7 5L4 33L12 28L16 37L21 31L24 42L27 31L32 37L36 28L44 33L41 5Z','#625477')+line('M8 9L24 35L40 9','#ac93bc',1.5),
   ARROW:line('M8 41L37 9','#b7915e',3)+path('M40 4L28 9L35 17Z','#d5e5ed')+path('M8 32L7 41L17 41L14 36Z','#ca6b55'),
   MERCHANT_SEAL:circle(24,24,16,'#d9ac56')+circle(24,24,12,'#aa6f3c','#f0d28a')+path('M17 28L24 13L31 28L24 34Z','#f1d184'),
   MOUNT_HORSE:path('M12 41L16 27L7 22L16 11L17 4L23 10L28 6L36 17L38 41Z','#b69872')+line('M31 15L27 39','#493b34',4)+circle(20,18,1.5,ink),
   MOUNT_DRAGON:path('M11 42L16 25L5 22L14 13L12 4L23 10L36 3L32 15L43 13L36 27L39 42Z','#60888c')+line('M31 20L32 36','#d2c280',3)+gem(21,19,2,'#f6b670'),
  };
  const source=id.startsWith('UNQ_')?MONSTERS[id.slice(4)]:undefined;
  const sourceIcon:Record<string,string>={wolf:'WOLF_FANG',alpha:'ALPHA_FANG',boar:'BOAR_TUSK',bear:'BEAR_CLAW',shroom:'SHROOM_CAP',slime:'SLIME_JELLY',stump:'HEART_WOOD',bat:'BAT_WING'};
  if(source?.base)art=path('M24 43Q5 37 11 21L17 26L23 4L31 18L37 12Q47 34 24 43Z',a)+gem(24,29,9,c);
  else if(source&&special[sourceIcon[source.model]])art=special[sourceIcon[source.model]];
  else if(source?.model==='fox')art=path('M9 41Q36 43 38 13L30 4L25 15L15 20Q7 24 9 41Z',a)+path('M10 28L18 32L25 24L23 39L9 41Z',c);
  else if(special[id])art=special[id];
  else if(/HIDE|PELT|FUR/.test(id)){art=path('M10 5L18 10H30L38 5L35 18L41 31L35 43L25 37L13 43L7 31L13 18Z',id==='FOX_PELT'?'#ce8d58':id==='SHADOW_FUR'?'#574867':'#9d9b95')+line('M19 15L24 25L29 15M18 27L24 32L30 27','#e8d6bd',2);}
  else if(id==='DUNE_SHELL'){art=path('M6 32Q4 9 24 6Q45 10 42 32L24 43Z','#c99d61')+line('M24 9V39M16 11L20 36M32 11L28 36M9 20L16 33M39 20L32 33','#795b3e',2);}
  else if(/IRON_ORE/.test(id)){art=path('M6 32L13 12L30 6L42 24L36 40L17 43Z','#657786')+path('M13 12L25 17L30 6L42 24L25 28Z','#bac8cb')+line('M25 17V28L17 43','#354757',2);}
  else if(/MOSS_HEART|MAT_MEADOW/.test(id)){art=path('M24 41Q3 29 10 14Q20 6 24 16Q31 6 39 15Q43 30 24 41Z',id==='MAT_MEADOW'?'#d8be69':'#74916a')+path('M24 22Q18 5 35 6Q40 20 24 22Z','#98bd71')+line('M24 23L33 10','#dce9ac',1);}
  else{const profiles:Record<string,string>={FROST_CRYSTAL:'M18 40L9 18L18 4L27 18L25 40L37 31L39 14L29 20L25 40Z',MAGMA_CORE:'M8 15L23 5L39 15L42 32L25 43L6 32Z',VOID_SHARD:'M12 30L23 3L35 14L30 27L36 39L18 44Z',MAT_GROVE:'M24 42Q3 21 15 8Q24 19 31 4Q46 23 24 42Z',MAT_GLACIER:'M8 24L24 3L41 24L24 44Z',MAT_DUNE:'M9 32L12 15L33 6L41 25L30 42Z',MAT_CINDER:'M8 35L14 7L26 18L35 4L41 34L25 43Z',MAT_ECLIPSE:'M6 24L24 3L42 24L24 44Z'};art=path(profiles[id]??'M9 15L24 5L39 15L35 36L24 44L13 36Z')+line('M24 11L18 24L26 37M18 24L34 19',c,2.5)+gem(29,21,4);}
 }
 if(/^(UNQ_|DIVINE_|BLUEPRINT_|BOOK_|SKILLBOOK_|SCROLL_)/.test(id)){
  const sig=insignia(id),gold=id.startsWith('DIVINE_')?'#edc875':c;
  art+=line('M3 12V4H11M37 4H45V12M3 36V44H11M37 44H45V36',gold,1.4);
  // Each relic bears its own maker's rune, also carried by the matching divine equipment.
  for(let i=0;i<12;i++)if((sig>>>i)&1){const x=5+(i%6)*7,y=i<6?3:45;art+=line(`M${x-1} ${y}L${x} ${y+(i<6?2:-2)}L${x+1} ${y}`,gold,1.2);}
 }
 if(id==='GEAR_CINDER')art+=path('M8 32L15 26L18 33L14 36Z','#e9b567')+gem(13,30,3,'#ffe4a4');
 if(id==='FAIRY_CHARM')art=path('M24 10C7 0 4 24 19 24C8 36 22 42 24 29C26 42 40 36 29 24C44 24 41 0 24 10Z','#a4d9c3')+gem(24,22,8,'#fae699');
 const svg=`<svg viewBox="0 0 48 48" width="100%" height="100%" role="img" aria-label="${d.name.replace(/[&<>\"]/g,'')}" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="24" cy="43" rx="16" ry="3" fill="#101923" opacity=".18"/>${art}</svg>`;
 cache.set(id,svg);return svg;
}
