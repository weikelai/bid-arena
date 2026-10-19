import {chromium,expect} from '@playwright/test';
import {createServer,request} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
if(process.env.SIMULATION_ALLOW_MUTATION!=='isolated')throw Error('Isolated environment required');
const upstream=new URL(process.env.API_BASE_URL),root=resolve('dist');
const server=createServer(async(req,res)=>{
 if(req.url.startsWith('/api/')){const proxy=request(new URL(req.url,upstream.origin),{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});proxy.on('error',()=>{res.writeHead(502);res.end();});req.pipe(proxy);return;}
 try{const path=resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!path.startsWith(root))throw Error();const data=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(path)]??'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium',headless:true});const base='http://127.0.0.1:'+server.address().port,errors=[];
 async function open(email,password){const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByLabel('邮箱',{exact:true}).fill(email);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('heading',{name:'我的钱包'})).toBeVisible();return page;}
 const admin=await open('admin@example.com','Admin123456!'),a=await open('bidder_a@example.com','Test123456!'),b=await open('bidder_b@example.com','Test123456!');
 const title='Agent browser '+Date.now();await admin.getByRole('tab',{name:'创建拍卖',exact:true}).click();await admin.getByLabel('名称',{exact:true}).fill(title);await admin.getByLabel('时长（秒）').fill('180');await admin.getByRole('button',{name:'创建 DRAFT 拍品'}).click();await expect(admin.getByRole('heading',{name:title})).toBeVisible();
 await admin.getByRole('tab',{name:'Agent',exact:true}).click();await admin.getByLabel('新 Agent 邮箱').fill('browser-agent-'+Date.now()+'@example.com');await admin.getByLabel('初始密码（至少 12 位）').fill('BrowserTestOnly123!');await admin.getByRole('button',{name:'创建 Agent 用户',exact:true}).click();await expect(admin.getByLabel('Agent 用户 ID')).not.toHaveValue('');
 await admin.getByRole('button',{name:'签发本场受限 Token',exact:true}).click();await admin.getByRole('button',{name:'创建自动竞拍任务',exact:true}).click();await expect(admin.getByLabel('一次性 Agent Token')).toHaveCount(0);const task=admin.locator('.agent-job').filter({hasText:'自动竞拍'}).first();await task.getByRole('button',{name:'启动',exact:true}).click();await expect(task).toContainText('DRAFT',{timeout:15000});
 await admin.getByRole('button',{name:'开始拍卖',exact:true}).click();await expect(task).toContainText('BID_ACCEPTED',{timeout:20000});
 for(const [page,amount] of [[a,120],[b,140]]){await page.getByRole('button',{name:'刷新列表',exact:true}).click();await page.getByRole('button').filter({hasText:title}).click();await page.getByRole('button',{name:'加入拍卖',exact:true}).click();await page.getByLabel('出价积分').fill(String(amount));await page.getByRole('button',{name:'提交出价',exact:true}).click();await expect(page.getByRole('status')).toContainText('出价已接受');await expect.poll(async()=>task.textContent(),{timeout:15000}).toContain('BID_ACCEPTED');await new Promise(r=>setTimeout(r,4000));}
 await task.getByRole('button',{name:'暂停',exact:true}).click();await expect(task).toContainText('PAUSED',{timeout:10000});await task.getByRole('button',{name:'启动',exact:true}).click();await admin.getByRole('button',{name:'取消拍卖',exact:true}).click();await expect(task).toContainText('FINISHED',{timeout:15000});await task.getByRole('button',{name:'决策历史',exact:true}).click();await expect(admin.locator('.agent-jobs ol')).toContainText('CANCELLED');
 expect(errors).toEqual([]);console.log('PASS Agent browser: admin task create/start/pause/history, two humans+Worker bidding, Token hidden, cancelled final state, no page errors');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
