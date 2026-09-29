import { ITEMS } from '@shared/data';
/** One art direction shared by equipment geometry and inventory illustrations. */
export type Theme = 'iron'|'wood'|'fang'|'frost'|'ember'|'grove'|'arcane'|'void'|'storm'|'moon'|'sand'|'leather'|'royal';
export const PALETTES:Record<Theme,[number,number,number]>={
 iron:[0x8eabc0,0x263848,0xd8e7ef],wood:[0xae7844,0x493023,0xd7b879],fang:[0xf0dfb1,0x453b3a,0x73bad1],
 frost:[0xb8edff,0x315f87,0x72deff],ember:[0x433b44,0x8b3529,0xffa13c],grove:[0x3c7964,0x463c2d,0xbde98a],
 arcane:[0x7766b2,0x302747,0xe9c779],void:[0x352e50,0x141e32,0xc694ff],storm:[0x507ca8,0x1f354e,0x8df0ff],
 moon:[0xc4cfe3,0x374563,0xffedb3],sand:[0xcba96f,0x654537,0x72c9c2],leather:[0x8c6040,0x3b2c27,0xd2b583],royal:[0x385786,0x172a4d,0xeac475]};
export function themeOf(id:string):Theme {
 if(id==='STARTER_CHEST')return 'grove';
 id += ' '+(ITEMS[id]?.name??'').toUpperCase();
 if(/FROST|GLACIER|RIME|SILVERFANG/.test(id))return 'frost'; if(/EMBER|INFERNO|CINDER|MAGMA|FLAME/.test(id))return 'ember';
 if(/VOID|ECLIPSE|SHADOW|(?:^|[ _])NIGHT(?:[ _]|$)|DUSK|AMETHYST|REAPER/.test(id))return 'void';if(/STORM|LIGHTNING/.test(id))return 'storm';
 if(/MOON|ALPHA/.test(id))return 'moon';if(/ELVEN|SYLVAN|MEADOW|GROVE|MOSS|HEART_WOOD|BLOOM|TREANT|ELDERBARK|BRIAR|SPORE|SHROOM/.test(id))return 'grove';
 if(/ARCANE|MAGE|APPRENTICE|MANA|MP_|ELIXIR/.test(id))return 'arcane';if(/SAND|DUNE|AMBER|SCARAB|SCORPION|COPPERBACK/.test(id))return 'sand';
 if(/FANG|TUSK|CLAW|WOLF/.test(id))return 'fang';if(/WOODEN|HUNTER|LONGBOW/.test(id))return 'wood';
 if(/LEATHER|STARTER|RANGER|FUR|HIDE|PELT/.test(id))return 'leather';if(/KNIGHT|GUILD|KITE/.test(id))return 'royal';return 'iron';
}
export const hex=(n:number)=>'#'+n.toString(16).padStart(6,'0');

export const insignia=(id:string)=>Array.from(id).reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);
