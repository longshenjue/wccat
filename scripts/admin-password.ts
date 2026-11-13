import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
import {randomBytes} from 'node:crypto';
import {hashAdminPassword} from '../src/lib/admin-auth';
async function main(){
 if(!process.stdin.isTTY)throw new Error('请在交互终端运行，以隐藏密码输入。');
 const output=new Writable({write(_chunk,_encoding,callback){callback();}});
 const input=createInterface({input:process.stdin,output,terminal:true});
 process.stdout.write('管理员密码（至少12个字符，输入隐藏）：');
 const password=await new Promise<string>(resolve=>input.question('',resolve));
 input.close();process.stdout.write('\n');
 console.log('WCCAT_ADMIN_PASSWORD_HASH='+hashAdminPassword(password));
 console.log('WCCAT_ADMIN_SESSION_SECRET='+randomBytes(32).toString('hex'));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

