import type {PublicationReference,PublicationRequest} from './types';
export async function requestPublication(input:PublicationRequest):Promise<PublicationReference>{
 const response=await fetch('/api/admin/publications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),cache:'no-store'});
 const result=await response.json();if(!response.ok)throw new Error(result.error??'准备公开资料页失败，请重试。');
 if(!result.publication||!/^[a-f0-9]{24}$/.test(result.publication.id)||result.publication.path!=='/p/'+result.publication.id||result.publication.reference!==result.publication.id.slice(0,8).toUpperCase())throw new Error('公开资料页标识无效。');
 return result.publication as PublicationReference;
}
