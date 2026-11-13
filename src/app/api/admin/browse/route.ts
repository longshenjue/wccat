import {requireAdmin,adminErrorResponse,AdminError} from '@/lib/admin-auth';
import {hourlyBrowse,browseItem,dailyBrowse,topicTrend,BrowseError} from '@/lib/admin-browse';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request) {
 try {
  requireAdmin(request);
  const query=Object.fromEntries(new URL(request.url).searchParams);
  const view=query.view;
  const result=view==='hourly'?hourlyBrowse(query):view==='detail'?browseItem(query):view==='daily'?dailyBrowse(query.date):view==='trend'?topicTrend(query):undefined;
  if(result===undefined)throw new AdminError('查询类型无效。');
  return Response.json(result,{headers:{'cache-control':'private, no-store'}});
 } catch(error) {
  return adminErrorResponse(error instanceof BrowseError?new AdminError(error.message,error.status):error);
 }
}
