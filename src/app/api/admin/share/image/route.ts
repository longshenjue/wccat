import {AdminError,adminErrorResponse,requireAdmin} from '@/lib/admin-auth';
import {readDailyReportFromDb} from '@/lib/db';
import {parseDailyReportDate} from '@/lib/daily-window';
import {getValidShareEn} from '@/lib/shareen';
import {readOwnImage,hasWebpDimensions} from '@/lib/shareen-image-state';

export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(request:Request){
 try{
  requireAdmin(request);
  const query=new URL(request.url).searchParams;
  const date=query.get('date'),topicId=query.get('topicId'),id=query.get('assetId');
  const missing=new AdminError('该配图不存在。',404);
  try{parseDailyReportDate(date);}catch{throw missing;}
  if(!topicId||!id||!(/^[a-f0-9]{64}$/.test(id)))throw missing;
  const report=readDailyReportFromDb(date!);
  const copy=report&&getValidShareEn(report);
  const index=copy?.highlights.findIndex(row=>row.topicId===topicId&&row.imageAsset?.id===id)??-1;
  if(!report||!copy||index<0)throw missing;
  const image=readOwnImage(report,copy,index,copy);
  if(!image||!await hasWebpDimensions(image))throw missing;
  const {bytes}=image;
  return new Response(new Uint8Array(bytes),{headers:{
   'content-type':'image/webp','content-length':String(bytes.length),'cache-control':'private, no-cache','vary':'Cookie','x-content-type-options':'nosniff'
  }});
 }catch(error){return adminErrorResponse(error);}
}
