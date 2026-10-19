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
 await admin.getByRole('tab',{name:'Agent',exact:true}).click();
 await expect(admin.getByRole('button',{name:'创建并启动 Agent',exact:true})).toBeEnabled();
 await expect(admin.getByLabel('一次性 Agent Token')).toHaveCount(0);await expect(admin.getByLabel('新 Agent 邮箱')).toHaveCount(0);
 await admin.getByLabel('任务名称',{exact:true}).fill('浏览器一键 Agent');await admin.getByLabel('最高出价（积分）').fill('300');await admin.getByLabel('最大出价次数').fill('10');
 for(const [width,height] of [[1440,900],[1920,1080]]){await admin.setViewportSize({width,height});await admin.screenshot({path:'../backend/target/agent-wizard-form-'+width+'.png'});const size=await admin.evaluate(()=>({height:document.documentElement.scrollHeight,viewport:innerHeight,scroll:getComputedStyle(document.querySelector('.inspector-scroll')).overflowY}));expect(size.height).toBeLessThanOrEqual(size.viewport+1);expect(size.scroll).toBe('auto');}
 const launches=[];admin.on('response',async r=>{if(r.url().endsWith('/admin/agent-launch'))launches.push(await r.json());});
 await admin.getByRole('button',{name:'创建并启动 Agent',exact:true}).click();const task=admin.locator('.agent-job').filter({hasText:'浏览器一键 Agent'}).first();
 await expect(task).toContainText('等待管理员开始拍卖',{timeout:20000});expect(launches).toHaveLength(1);expect(Object.keys(launches[0]).sort()).toEqual(['id','replayed']);
 await expect(admin.getByRole('button',{name:'创建并启动 Agent',exact:true})).toHaveCount(0);
 await admin.getByRole('button',{name:'开始拍卖',exact:true}).click();await expect(task.locator('.agent-metrics')).toContainText('110',{timeout:20000});
 for(const [page,amount] of [[a,120],[b,140]]){await page.getByRole('button',{name:'刷新列表',exact:true}).click();await page.getByRole('button').filter({hasText:title}).click();await page.getByRole('button',{name:'加入拍卖',exact:true}).click();await page.getByLabel('出价积分').fill(String(amount));await page.getByRole('button',{name:'提交出价',exact:true}).click();await expect(page.getByRole('status')).toContainText('出价已接受');await expect(task.locator('.agent-metrics')).toContainText(String(amount+10),{timeout:15000});}
 await task.getByRole('button',{name:'暂停',exact:true}).click();await expect(task).toContainText('已暂停',{timeout:10000});
 await task.getByRole('button',{name:'恢复运行',exact:true}).click();await expect(task.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
 await task.getByRole('button',{name:'停止 Agent',exact:true}).click();await expect(task).toContainText('已停止',{timeout:10000});await task.getByRole('button',{name:'恢复运行',exact:true}).click();
 await admin.reload();await admin.getByRole('button').filter({hasText:title}).click();await admin.getByRole('tab',{name:'Agent',exact:true}).click();
 await expect(task).toHaveCount(1);await expect(admin.getByRole('button',{name:'创建并启动 Agent',exact:true})).toHaveCount(0);
 for(const [width,height] of [[1440,900],[1920,1080]]){await admin.setViewportSize({width,height});await admin.screenshot({path:'../backend/target/agent-wizard-monitor-'+width+'.png'});expect(await admin.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThanOrEqual(height+1);}
 await admin.getByRole('button',{name:'取消拍卖',exact:true}).click();await expect(task).toContainText('已结束',{timeout:20000});await task.getByRole('button',{name:'决策历史',exact:true}).click();await expect(task.locator('.agent-history')).toContainText('拍卖已取消');
 await task.getByText('授权与任务详情',{exact:true}).click();await task.getByRole('button',{name:'撤销 Token',exact:true}).click();await expect(task).toContainText('已撤销');
 expect(errors).toEqual([]);console.log('PASS Agent wizard browser: one-click create/start without credentials, two humans+Worker bids, pause/resume/stop, reload recovery, cancellation/revocation, 1440/1920 layouts and local scroll, no page errors');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
