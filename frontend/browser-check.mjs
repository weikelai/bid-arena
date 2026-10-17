import { chromium, expect } from '@playwright/test';
import { createServer, request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

if(process.env.SIMULATION_ALLOW_MUTATION!=='isolated')throw new Error('Browser checks require an isolated database');
const upstream=new URL(process.env.API_BASE_URL),root=resolve('dist');
const server=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/')) {
    const proxy=request(new URL(req.url,upstream.origin),{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    proxy.on('error',()=>{res.writeHead(502);res.end();});req.pipe(proxy);return;
  }
  try {const file=resolve(root,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+'/')&&!file.startsWith(root+'\\'))throw new Error();const data=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]??'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??(process.platform==='win32'?'msedge':'chromium'),headless:true});
  const base=`http://127.0.0.1:${server.address().port}`;
  const errors=[];const contexts=[];
  async function open(email,password){const context=await browser.newContext();contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByLabel('邮箱',{exact:true}).fill(email);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('heading',{name:'我的钱包'})).toBeVisible();return page;}
  const admin=await open('admin@example.com','Admin123456!');
  const title='Browser acceptance '+Date.now();await admin.getByLabel('名称',{exact:true}).fill(title);await admin.getByLabel('时长（秒）').fill('180');await admin.getByRole('button',{name:'创建 DRAFT 拍品'}).click();await expect(admin.getByRole('heading',{name:title})).toBeVisible();await admin.getByRole('button',{name:'开始拍卖',exact:true}).click();
  const a=await open('bidder_a@example.com','Test123456!'),b=await open('bidder_b@example.com','Test123456!');
  for(const page of [a,b]){await page.getByRole('button',{name:new RegExp(title)}).click();await page.getByRole('button',{name:'加入拍卖',exact:true}).click();await expect(page.getByRole('status')).toContainText('已加入拍卖');}
  await a.getByLabel('出价积分').fill('110');await a.getByRole('button',{name:'提交出价'}).click();await expect(a.getByRole('status')).toContainText('出价成功');
  await expect(b.locator('.room .stats .price').first()).toHaveText('110',{timeout:10000});
  await b.context().setOffline(true);await expect(b.locator('.room .eyebrow')).toContainText('连接中断',{timeout:10000});
  await a.getByLabel('出价积分').fill('120');await a.getByRole('button',{name:'提交出价'}).click();await expect(a.getByRole('status')).toContainText('出价成功');
  await b.context().setOffline(false);await expect(b.locator('.room .stats .price').first()).toHaveText('120',{timeout:10000});
  await expect(b.locator('.room .eyebrow')).toContainText('已同步');
  await admin.getByRole('button',{name:'取消拍卖',exact:true}).click();await expect(a.locator('.room .notice')).toContainText('CANCELLED',{timeout:10000});await expect(a.locator('aside section').first()).toContainText('冻结 0');
  await a.screenshot({path:'../.local/browser-acceptance.png',fullPage:true});
  expect(errors).toEqual([]);
  console.log('PASS browser: admin create/start/cancel; two independent users; join/bid; remote price update; offline/reconnect snapshot; wallet release; no page errors');
  for(const context of contexts)await context.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
