/** Quarantine repeated JSON properties instead of silently accepting the last model value. */
export function parseShareEnJson(content:string):unknown {
 const value:unknown=JSON.parse(content);
 let position=0;
 const repeated:Array<string[]>=[];
 const space=()=>{while(/\s/.test(content[position]??'')&&position<content.length)position++;};
 const string=()=>{
  const start=position++;
  while(position<content.length){
   if(content[position]==='\\'){position+=2;continue;}
   if(content[position++]==='"')break;
  }
  return JSON.parse(content.slice(start,position)) as string;
 };
 function walk(path:string[],depth:number):void {
  if(depth>128)throw new SyntaxError('ShareEn JSON nesting is too deep');
  space();
  if(content[position]==='{'){
   position++;space();const seen=new Set<string>();
   if(content[position]==='}'){position++;return;}
   while(position<content.length){
    space();const key=string();space();position++; // validated colon
    if(seen.has(key))repeated.push([...path,key]);seen.add(key);
    walk([...path,key],depth+1);space();
    if(content[position++]==='}')break;
   }
  }else if(content[position]==='['){
   position++;space();if(content[position]===']'){position++;return;}
   let index=0;
   while(position<content.length){walk([...path,String(index++)],depth+1);space();if(content[position++]===']')break;}
  }else if(content[position]==='"')string();
  else while(position<content.length&&!/[\s,}\]]/.test(content[position]))position++;
 }
 walk([],0);
 for(const path of repeated){
  let parent:unknown=value;
  for(const key of path.slice(0,-1)){
   if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,key)){parent=undefined;break;}
   parent=(parent as Record<string,unknown>)[key];
  }
  if(parent&&typeof parent==='object')delete (parent as Record<string,unknown>)[path.at(-1)!];
 }
 return value;
}
