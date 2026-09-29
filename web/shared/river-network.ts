type Point={i:number;j:number};
type Cell=Point;
const pointKey=(p:Point)=>`${p.i},${p.j}`;
const edgeKey=(a:Point,b:Point)=>[pointKey(a),pointKey(b)].sort().join('|');
export function riverEdgeKey(i:number,j:number,d:string){
  const a=d==='e'?{i,j:j-1}:d==='s'?{i:i-1,j}:{i:i-1,j:j-1};
  const b=d==='w'?{i:i-1,j}:d==='n'?{i,j:j-1}:{i,j};
  return edgeKey(a,b);
}
/** A connected watershed along existing map boundaries, rather than independently random river tiles. */
export function buildRiverNetwork(cells:Cell[],towns:{x:number;z:number}[],size:number){
  const graph=new Map<string,Set<string>>();
  for(const c of cells)for(const d of ['n','e','s','w']) {
    const [a,b]=riverEdgeKey(c.i,c.j,d).split('|');
    if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a)!.add(b);graph.get(b)!.add(a);
  }
  const points=[...graph.keys()].map(key=>{const [i,j]=key.split(',').map(Number);return {key,i,j};});
  const outlet=points.sort((a,b)=>b.j-a.j||Math.abs(a.i)-Math.abs(b.i))[0];
  const joined=new Set([outlet.key]),edges=new Set<string>();
  const connect=(target:string)=>{
    if(joined.has(target))return;
    const queue=[target],parent=new Map<string,string|null>([[target,null]]);let hit:string|undefined;
    for(let at=0;at<queue.length;at++){
      const n=queue[at];if(joined.has(n)){hit=n;break;}
      for(const next of graph.get(n)??[])if(!parent.has(next)){parent.set(next,n);queue.push(next);}
    }
    if(!hit)throw new Error('Disconnected river boundary graph');
    for(let n=hit;parent.get(n)!=null;){const next=parent.get(n)!;edges.add([n,next].sort().join('|'));joined.add(next);n=next;}
  };
  for(const town of [...towns].sort((a,b)=>a.z-b.z||a.x-b.x)){
    const i=Math.round(town.x/size),j=Math.round(town.z/size),key=riverEdgeKey(i,j,'e'),[a,b]=key.split('|');
    connect(a);edges.add(key);joined.add(a);joined.add(b);
  }
  return {edges,outlet:{x:(outlet.i+.5)*size,z:(outlet.j+.5)*size}};
}
