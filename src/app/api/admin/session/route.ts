import {NextResponse} from 'next/server';
import {ADMIN_COOKIE,SESSION_SECONDS,adminConfigured,createAdminSession,verifyAdminPassword,verifyAdminSession,requestToken,requireSameOrigin,loginAllowed,readAdminJson,AdminError,adminErrorResponse} from '@/lib/admin-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 return NextResponse.json({configured:adminConfigured(),authenticated:verifyAdminSession(requestToken(request))},{headers:{'cache-control':'no-store'}});
}
export async function POST(request:Request){
 try{
  requireSameOrigin(request);
  if(!adminConfigured())throw new AdminError('管理员入口尚未配置。',503);
  if(!loginAllowed(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'unknown'))throw new AdminError('登录尝试过多，请在15分钟后重试。',429);
  const body=await readAdminJson(request);
  if(typeof body.password!=='string'||!verifyAdminPassword(body.password))throw new AdminError('密码不正确。',401);
  const response=NextResponse.json({ok:true},{headers:{'cache-control':'no-store'}});
  response.cookies.set(ADMIN_COOKIE,createAdminSession(),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:SESSION_SECONDS});
  return response;
 }catch(error){return adminErrorResponse(error);}
}
export async function DELETE(request:Request){
 try{
  requireSameOrigin(request);
  const response=NextResponse.json({ok:true},{headers:{'cache-control':'no-store'}});
  response.cookies.set(ADMIN_COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:0});
  return response;
 }catch(error){return adminErrorResponse(error);}
}

