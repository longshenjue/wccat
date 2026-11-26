"use client";
import {useState} from 'react';
import type {PublicationLanguage,PublicationReference} from '../../lib/publications/types';
import {publicationMaterials} from '../../lib/publications/materials';

export function PublicationControls({language,publication,disabled,prepare,hasComments,mainPost}:{language:PublicationLanguage;publication?:PublicationReference;disabled:boolean;prepare:()=>Promise<PublicationReference>;hasComments:boolean;mainPost:string}){
 const [working,setWorking]=useState(false),[message,setMessage]=useState('');
 const materials=publication&&typeof window!=='undefined'?publicationMaterials(publication,window.location.origin,language,hasComments):undefined;
 async function ready(){setWorking(true);setMessage('');try{await prepare();setMessage('公开资料页已准备好；此版本的内容已固定，可以复制来源回复。');}catch(error){setMessage(error instanceof Error?error.message:'准备失败。');}finally{setWorking(false);}}
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setMessage('已复制。');}catch{setMessage('复制失败，可直接选中文字复制。');}}
 return <section className="publication-controls" aria-label="来源回复与公开资料页"><h3>来源回复与公开资料页</h3><p>主帖配文直接配图发布。来源回复单独发布一个链接，资料页固定为本次保存版本；也可将索引页放在 X 主页。</p>
  {/https?:\/\/|\bwww\./i.test(mainPost)?<p className="publication-control-note">当前主帖包含链接；你可以保留，也可以把来源链接移到下方回复。</p>:null}
  {/sources\.txt|来源文件/u.test(mainPost)?<p className="publication-control-note">当前配文提到了下载包内的来源文件，X 读者无法直接访问该文件；建议改为“来源见回复”。</p>:null}
  <button type="button" disabled={disabled||working} onClick={ready}>{working?'正在准备…':materials?'刷新发布资料页':'准备公开资料页'}</button>
  {materials?<><label>来源回复<textarea aria-label="来源回复" readOnly rows={4} value={materials.reply}/></label><div className="publication-control-actions"><button type="button" onClick={()=>copy(materials.reply)}>复制来源回复</button><button type="button" onClick={()=>copy(materials.url)}>复制资料页链接</button><a href={materials.url} target="_blank" rel="noopener noreferrer">查看资料页 ↗</a></div><p>图片资料编号：<b>#{publication!.reference}</b></p><p>主页索引：<a href={materials.indexUrl} target="_blank" rel="noopener noreferrer">{materials.indexUrl}</a></p></>:<p className="publication-control-note">准备后会公开并固定本次发布内容；下载发布包也会同步准备。仅生成草稿不会公开内容。</p>}
  {message?<p role="status">{message}</p>:null}
 </section>;
}
