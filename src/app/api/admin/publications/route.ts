import {AdminError,adminErrorResponse,readAdminJson,requireAdmin} from '@/lib/admin-auth';
import {preparePublication} from '@/lib/publications/store';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  requireAdmin(request,true);const body=await readAdminJson(request,256*1024);
  if(typeof body.expectedRevision!=='string'||!/^[a-f0-9]{64}$/.test(body.expectedRevision))throw new AdminError('请先保存分享文案并载入有效版本。');
  let publication;
  if(body.kind==='topic'&&typeof body.id==='string'&&/^[a-f0-9]{64}$/.test(body.id))publication=preparePublication({kind:'topic',id:body.id,expectedRevision:body.expectedRevision});
  else if(body.kind==='daily'&&typeof body.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(body.date)&&typeof body.expectedSourceFingerprint==='string'&&/^[a-f0-9]{64}$/.test(body.expectedSourceFingerprint))publication=preparePublication({kind:'daily',date:body.date,expectedRevision:body.expectedRevision,expectedSourceFingerprint:body.expectedSourceFingerprint,...(body.copy?{copy:body.copy}:{})});
  else throw new AdminError('发布来源无效。');
  return Response.json({publication},{headers:{'cache-control':'private, no-store'}});
 }catch(error){return adminErrorResponse(error instanceof AdminError?error:new AdminError(error instanceof Error?error.message:'准备发布失败。'));}
}
