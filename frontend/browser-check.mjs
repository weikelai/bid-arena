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
  await expect(a.getByRole('table',{name:'出价历史'})).toContainText('120');
  await admin.getByRole('button',{name:'取消拍卖',exact:true}).click();await expect(a.locator('.room .notice')).toContainText('CANCELLED',{timeout:10000});await expect(a.locator('aside section').first()).toContainText('冻结 0');
  await a.screenshot({path:'../.local/browser-acceptance.png',fullPage:true});
  // Hold an old user's private response across logout; it must never populate the next session.
  let releaseWallet, walletRequested, walletHandled;
  const gate=new Promise(r=>{releaseWallet=r;});const requested=new Promise(r=>{walletRequested=r;});const handled=new Promise(r=>{walletHandled=r;});
  await a.route('**/api/v1/wallets/me',async route=>{walletRequested();await gate;await route.fulfill({json:{total_balance:777,frozen_balance:0,available_balance:777,transactions:[]}});walletHandled();});
  await a.reload({waitUntil:'domcontentloaded'});await requested;
  await a.getByRole('button',{name:'退出登录'}).click();releaseWallet();await handled;
  await a.unroute('**/api/v1/wallets/me');
  await a.getByLabel('邮箱',{exact:true}).fill('bidder_b@example.com');await a.getByLabel('密码',{exact:true}).fill('Test123456!');
  await a.getByRole('button',{name:'登录',exact:true}).click();await expect(a.locator('aside section').first()).toContainText('总余额 1000');
  await expect(a.locator('aside section').first()).not.toContainText('777');
  const finishTitle='Browser automatic finish '+Date.now();
  await admin.getByLabel('名称',{exact:true}).fill(finishTitle);await admin.getByLabel('时长（秒）').fill('8');
  await admin.getByRole('button',{name:'创建 DRAFT 拍品'}).click();await expect(admin.getByRole('heading',{name:finishTitle})).toBeVisible();
  await admin.getByRole('button',{name:'开始拍卖',exact:true}).click();
  await expect(admin.locator('.room .eyebrow')).toContainText('RUNNING');
  const refreshed=b.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auctions'&&r.request().method()==='GET');
  await b.getByRole('button',{name:'刷新列表',exact:true}).click();
  const auctionList=await (await refreshed).json();
  expect(auctionList.some(item=>item.title===finishTitle),'refreshed authoritative list contains newly started auction').toBe(true);
  await b.getByRole('button',{name:new RegExp(finishTitle)}).click();
  await b.getByRole('button',{name:'加入拍卖',exact:true}).click();await expect(b.getByRole('status')).toContainText('已加入拍卖');
  await b.getByLabel('出价积分').fill('110');await b.getByRole('button',{name:'提交出价'}).click();await expect(b.getByRole('status')).toContainText('出价成功');
  await expect(b.locator('.room .notice')).toContainText('SOLD',{timeout:25000});
  await expect(b.locator('aside section').first()).toContainText('总余额 890');await expect(b.locator('aside section').first()).toContainText('冻结 0');
  await expect(b.getByRole('button',{name:'提交出价'})).toBeDisabled();
  expect(errors).toEqual([]);
  console.log('PASS browser: admin create/start/cancel; two independent users; join/bid/history; remote update; offline/reconnect; wallet release; delayed private response across logout/login; automatic SOLD result and wallet debit; no page errors');
  for(const context of contexts)await context.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
