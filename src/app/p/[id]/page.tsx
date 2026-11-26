import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {readPublication} from '@/lib/publications/store';
import {PublicationReader} from '@/components/publications/publication-reader';
import '@/components/publications/publication.css';
export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>;searchParams:Promise<{lang?:string}>};
export async function generateMetadata({params,searchParams}:Props):Promise<Metadata>{
 const {id}=await params,language=(await searchParams).lang==='zh'?'zh':'en',publication=readPublication(id);
 if(!publication)return {title:'WcCAT · Not found'};
 const title=publication.payload.titles[language],description=language==='en'?'Context, original Chinese sources and comments behind this WcCAT post.':'WcCAT 帖子对应的背景、中文原始来源与个人评论。';
 return {title,description,openGraph:{title,description,type:'article'},twitter:{card:'summary',title,description}};
}
export default async function PublicationPage({params,searchParams}:Props){
 const {id}=await params,publication=readPublication(id);if(!publication)notFound();
 return <PublicationReader publication={publication} language={(await searchParams).lang==='zh'?'zh':'en'}/>;
}
