import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    getDb().prepare('select 1').get();
    return NextResponse.json({ok:true}, {headers:{'cache-control':'no-store'}});
  } catch {
    return NextResponse.json({ok:false}, {status:503,headers:{'cache-control':'no-store'}});
  }
}
