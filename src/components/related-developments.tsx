type Development={title:string;summary?:string;links:Array<{url:string;name:string}>};

/** Each retained development keeps its original wording and its own sources. */
export function RelatedDevelopments({developments,english=false}:{developments:Development[];english?:boolean}){
 if(!developments.length)return null;
 return <details className="related-developments"><summary>{english?'Related developments · Chinese source headlines':'同一主线的其他进展'}（{developments.length}）</summary><ul>{developments.map((stage,index)=><li key={index}><p lang="zh"><strong>{stage.title}</strong>{stage.summary?<><br/>{stage.summary}</>:null}</p>{stage.links.map((link,i)=><a key={i} href={link.url} target="_blank" rel="noopener noreferrer">{link.name} ↗ </a>)}</li>)}</ul></details>;
}
