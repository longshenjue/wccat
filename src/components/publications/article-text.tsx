import type {ReactNode} from 'react';
import type {PublicationLink} from '../../lib/publications/types';

/** Small text-only Markdown subset; raw HTML and model URLs never become executable markup. */
export function ArticleText({body,sources,headingLevel=3}:{body:string;sources:PublicationLink[];headingLevel?:2|3}){
 const Heading=headingLevel===2?'h2':'h3';
 const references=sources.filter(source=>source.researchId);
 function inline(value:string):ReactNode[]{
  return value.split(/(\[r-[a-z0-9-]+\]|\*\*[^*]+\*\*)/g).map((part,index)=>{
   const id=part.match(/^\[(r-[a-z0-9-]+)\]$/)?.[1],reference=id?references.find(source=>source.researchId===id):undefined;
   if(reference)return <sup key={index}><a href={`#${id}`} title={reference.title}>[{references.indexOf(reference)+1}]</a></sup>;
   if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>;
   return part;
  });
 }
 return <div className="publication-article">{body.split(/\n\s*\n/g).filter(Boolean).map((block,index)=>{
  const heading=block.match(/^#{1,3}\s+([^\n]+)(?:\n([\s\S]+))?$/);
  return heading?<section key={index} className={/our take|WcCAT点评/i.test(heading[1])?'publication-editorial-take':undefined}><Heading>{inline(heading[1])}</Heading>{heading[2]?<p>{inline(heading[2])}</p>:null}</section>:<p key={index}>{inline(block)}</p>;
 })}</div>;
}
