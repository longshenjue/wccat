"use client";
import {useEffect,useState,useCallback} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';

export function useAdminQuery() {
 const params=useSearchParams(),router=useRouter();
 const change=useCallback((changes:Record<string,string|null>)=>{
  const next=new URLSearchParams(params.toString());
  for(const [key,value] of Object.entries(changes)) {if(value)next.set(key,value);else next.delete(key);}
  router.push('/admin?'+next.toString(),{scroll:false});
 },[router,params]);
 return {params,change};
}
export function useAdminRead<T>(path:string) {
 const [view,setView]=useState<{path:string;data?:T;error?:string}>({path:''});
 useEffect(()=>{
  const controller=new AbortController();
  fetch(path,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const data=await response.json();if(!response.ok)throw new Error(data.error??'读取数据失败。');return data as T;
  }).then(data=>{if(!controller.signal.aborted)setView({path,data});})
   .catch(error=>{if(!controller.signal.aborted)setView({path,error:error instanceof Error?error.message:'读取数据失败。'});});
  return()=>controller.abort();
 },[path]);
 return view.path===path?{...view,loading:false}:{path,loading:true,data:undefined,error:undefined};
}
export function browseUrl(view:string,query:Record<string,string|undefined>) {
 const params=new URLSearchParams({view});
 for(const [key,value] of Object.entries(query))if(value)params.set(key,value);
 return '/api/admin/browse?'+params;
}
export function safeArticleHref(value:unknown) {
 if(typeof value!=='string')return undefined;
 try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}
}
export const chinaTime=(value:string)=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
