import './load-env';
import {readLatestDailyReportFromDb} from '../src/lib/db';
import {generateSharing} from '../src/lib/sharing';
import {parseDailyReportDate} from '../src/lib/daily-window';
async function main(){
 const args=process.argv.slice(2),force=args.includes('--force'),dates=args.filter(arg=>arg!=='--force');
 if(dates.length>1||args.length!==dates.length+Number(force))throw new Error('Usage: npm run daily:shareen -- [YYYY-MM-DD] [--force]');
 const date=dates[0]??readLatestDailyReportFromDb()?.reportDate;
 if(!date)throw new Error('没有已保存日报。');
 parseDailyReportDate(date);
 const result=await generateSharing(date,{format:'shareen',force});
 if(!result.shareEnReady)throw new Error('ShareEn 暂未生成，请查看上方日志；已有分享版本保留。');
 console.log(`[WcCAT] ShareEn ready for ${date}; download from /admin → 分享制作.`);
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
