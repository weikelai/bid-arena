import { chromium, expect } from '@playwright/test';
import { createServer, request } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { randomBytes } from 'node:crypto';

if(process.env.SIMULATION_ALLOW_MUTATION!=='isolated')throw new Error('Browser checks require an isolated database');
await mkdir('../.local/ui-refresh',{recursive:true});
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
  async function typography(page,state){
    for(const size of [{width:1440,height:900},{width:1920,height:1080}]){
      await page.setViewportSize(size);
      const result=await page.evaluate(()=>{
        const rgb=s=>s.match(/[\d.]+/g).map(Number),mix=(a,b)=>{const alpha=a[3]??1;return a.slice(0,3).map((v,i)=>v*alpha+b[i]*(1-alpha));};
        function background(el){if(!el)return [255,255,255];return mix(rgb(getComputedStyle(el).backgroundColor),background(el.parentElement));}
        function ratio(el){const style=getComputedStyle(el),bg=background(el),fg=mix(rgb(style.color),bg),lum=a=>a.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0),a=lum(fg),b=lum(bg);return {selector:el.className,font:parseFloat(style.fontSize),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};}
        const selectors=['.identity-row .micro','.wallet-sync','.wallet-split span','.room .eyebrow','.deadline','.secondary-stats small','.secondary-stats strong','.status-banner p','.inspector th','.inspector td','.cell-detail','.ledger-type','.inspector-tabs button','.state-tag','.participant-email','.kind-tag','.auction-id'];
        const colors=selectors.flatMap(s=>[...document.querySelectorAll(s)].map(ratio));
        return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,colors};
      });
      expect(result.scrollWidth).toBeLessThanOrEqual(size.width);expect(result.scrollHeight).toBeLessThanOrEqual(size.height);
      for(const color of result.colors)expect(color.ratio,JSON.stringify(color)).toBeGreaterThanOrEqual(4.5);
      console.log(JSON.stringify({scenario:'typography-contrast',state,...result}));
      await page.screenshot({path:`../.local/ui-refresh/type-${state}-${size.width}.png`});
    }
  }
  async function open(email,password){const context=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByLabel('邮箱',{exact:true}).fill(email);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('heading',{name:'我的钱包'})).toBeVisible();return page;}
  const admin=await open('admin@example.com','Admin123456!');
  await expect(admin.getByLabel('名称',{exact:true})).toHaveCount(0);
  await expect(admin.getByLabel('新 Agent 邮箱',{exact:true})).toHaveCount(0);
  await admin.getByRole('tab',{name:'创建拍卖',exact:true}).click();
  const title='Browser acceptance '+Date.now();await admin.getByLabel('名称',{exact:true}).fill(title);await admin.getByLabel('时长（秒）').fill('180');await admin.getByRole('button',{name:'创建 DRAFT 拍品'}).click();await expect(admin.getByRole('heading',{name:title})).toBeVisible();await admin.getByRole('button',{name:'开始拍卖',exact:true}).click();
  const a=await open('bidder_a@example.com','Test123456!'),b=await open('bidder_b@example.com','Test123456!');
  await typography(admin,'RUNNING-admin');
  await expect(a.getByRole('tab',{name:'Agent',exact:true})).toHaveCount(0);
  await expect(a.getByRole('tab',{name:'创建拍卖',exact:true})).toHaveCount(0);
  await a.getByRole('tab',{name:'资金流水',exact:true}).click();
  await expect(a.getByRole('table',{name:'资金流水',exact:true})).toBeVisible();
  await typography(a,'ledger-human');
  await a.getByRole('tab',{name:'出价历史',exact:true}).click();
  for(const page of [a,b]){await page.getByRole('button',{name:new RegExp(title)}).click();await page.getByRole('button',{name:'加入拍卖',exact:true}).click();await expect(page.getByRole('status')).toContainText('已加入拍卖');}
  await a.getByLabel('出价积分').fill('110');await a.getByRole('button',{name:'提交出价'}).click();await expect(a.getByRole('status')).toContainText('出价已接受');
  await expect(b.locator('.room .stats .price').first()).toHaveText('110',{timeout:10000});
  let releaseBid, capturedBid, bidHandled;
  const bidGate=new Promise(r=>{releaseBid=r;}),bidCaptured=new Promise(r=>{capturedBid=r;}),handledBid=new Promise(r=>{bidHandled=r;});
  await b.route('**/api/v1/auctions/*/bids',async route=>{if(route.request().method()!=='POST'){await route.continue();return;}const response=await route.fetch();const accepted=await response.json();expect(accepted.type).toBe('BID_ACCEPTED');console.log(JSON.stringify({scenario:'delayed-bid',request:route.request().postDataJSON(),response:accepted}));capturedBid();await bidGate;await route.fulfill({response});bidHandled();});
  await b.getByLabel('出价积分').fill('130');await b.getByRole('button',{name:'提交出价'}).click();await bidCaptured;
  await a.getByLabel('出价积分').fill('140');await a.getByRole('button',{name:'提交出价'}).click();await expect(a.locator('.room .stats .price').first()).toHaveText('140');
  releaseBid();await handledBid;await b.unroute('**/api/v1/auctions/*/bids');
  await expect(b.getByRole('status')).toContainText('出价已接受');
  await expect(b.getByTestId('standing')).toHaveText('你已被其他用户超过');
  await expect(a.getByTestId('standing')).toHaveText('你目前领先');
  await expect(b.locator('.room .stats .price').first()).toHaveText('140');
  // Fetch a real snapshot, hold its delivery while another action installs a newer seq.
  let releaseSnapshot, capturedSnapshot, snapshotHandled;let held=false;
  const snapshotGate=new Promise(r=>{releaseSnapshot=r;}),snapshotCaptured=new Promise(r=>{capturedSnapshot=r;}),handledSnapshot=new Promise(r=>{snapshotHandled=r;});
  await b.route('**/api/v1/auctions/*',async route=>{const path=new URL(route.request().url()).pathname;if(!/\/auctions\/\d+$/.test(path)||held){await route.continue();return;}held=true;const response=await route.fetch();capturedSnapshot();await snapshotGate;await route.fulfill({response});snapshotHandled();});
  await a.getByLabel('出价积分').fill('150');await a.getByRole('button',{name:'提交出价'}).click();await snapshotCaptured;
  await b.getByLabel('出价积分').fill('160');await b.getByRole('button',{name:'提交出价'}).click();await expect(b.locator('.room .stats .price').first()).toHaveText('160');
  releaseSnapshot();await handledSnapshot;await b.unroute('**/api/v1/auctions/*');
  await expect(b.locator('.room .stats .price').first()).toHaveText('160');await expect(b.getByTestId('standing')).toHaveText('你目前领先');
  await b.context().setOffline(true);await expect(b.locator('.room .eyebrow')).toContainText('连接中断',{timeout:10000});
  await a.getByLabel('出价积分').fill('170');await a.getByRole('button',{name:'提交出价'}).click();await expect(a.getByRole('status')).toContainText('出价已接受');
  await b.context().setOffline(false);await expect(b.locator('.room .stats .price').first()).toHaveText('170',{timeout:10000});
  await expect(b.locator('.room .eyebrow')).toContainText('已同步');
  await expect(a.getByRole('table',{name:'出价历史'})).toContainText('170');
  await admin.getByRole('button',{name:'取消拍卖',exact:true}).click();await expect(a.locator('.room .notice')).toContainText('CANCELLED',{timeout:10000});await expect(a.locator('aside section').first()).toContainText('冻结 0');
  await typography(a,'CANCELLED-human');
  await a.screenshot({path:'../.local/browser-acceptance.png',fullPage:true});
  // A response for the old room arrives only after another room has been selected.
  let releaseRoom,roomCaptured,roomHandled;let roomHeld=false;
  const roomGate=new Promise(r=>{releaseRoom=r;}),capturedRoom=new Promise(r=>{roomCaptured=r;}),handledRoom=new Promise(r=>{roomHandled=r;});
  await a.route('**/api/v1/auctions/*',async route=>{if(!/\/auctions\/\d+$/.test(new URL(route.request().url()).pathname)||roomHeld){await route.continue();return;}roomHeld=true;const response=await route.fetch();roomCaptured();await roomGate;await route.fulfill({response});roomHandled();});
  await a.getByRole('button',{name:new RegExp(title)}).click();await capturedRoom;
  await a.getByRole('button',{name:/Bid Arena Demo/}).click();await expect(a.locator('.room .eyebrow')).toContainText('DRAFT');
  await typography(a,'DRAFT-human');
  releaseRoom();await handledRoom;await a.unroute('**/api/v1/auctions/*');await expect(a.locator('.room .eyebrow')).toContainText('DRAFT');
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
  await admin.getByLabel('名称',{exact:true}).fill(finishTitle);await admin.getByLabel('时长（秒）').fill('15');
  await admin.getByRole('button',{name:'创建 DRAFT 拍品'}).click();await expect(admin.getByRole('heading',{name:finishTitle})).toBeVisible();
  await admin.getByRole('button',{name:'开始拍卖',exact:true}).click();
  await expect(admin.locator('.room .eyebrow')).toContainText('RUNNING');
  const refreshed=b.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auctions'&&r.request().method()==='GET');
  await b.getByRole('button',{name:'刷新列表',exact:true}).click();
  const auctionList=await (await refreshed).json();
  expect(auctionList.some(item=>item.title===finishTitle),'refreshed authoritative list contains newly started auction').toBe(true);
  await b.getByRole('button',{name:new RegExp(finishTitle)}).click();
  await b.getByRole('button',{name:'加入拍卖',exact:true}).click();await expect(b.getByRole('status')).toContainText('已加入拍卖');
  await b.getByLabel('出价积分').fill('110');await b.getByRole('button',{name:'提交出价'}).click();await expect(b.getByRole('status')).toContainText('出价已接受');
  let releaseRunning,runningCaptured,runningHandled;let runningHeld=false;
  const runningGate=new Promise(r=>{releaseRunning=r;}),capturedRunning=new Promise(r=>{runningCaptured=r;}),handledRunning=new Promise(r=>{runningHandled=r;});
  await b.route('**/api/v1/auctions/*',async route=>{if(!/\/auctions\/\d+$/.test(new URL(route.request().url()).pathname)||runningHeld){await route.continue();return;}runningHeld=true;const response=await route.fetch();expect((await response.json()).status).toBe('RUNNING');runningCaptured();await runningGate;await route.fulfill({response});runningHandled();});
  const losing=await open('bidder_a@example.com','Test123456!');await losing.getByRole('button',{name:new RegExp(finishTitle)}).click();
  await expect(losing.getByRole('heading',{name:finishTitle,exact:true})).toBeVisible();
  await expect(losing.locator('.room .eyebrow')).toContainText('RUNNING');
  await losing.getByRole('button',{name:'加入拍卖',exact:true}).click();await expect(losing.getByRole('status')).toContainText('已加入拍卖');await capturedRunning;
  await losing.context().setOffline(true);
  await expect(admin.locator('.room .notice')).toContainText('SOLD',{timeout:30000});
  await b.getByLabel('出价积分').fill('120');await b.getByRole('button',{name:'提交出价'}).click();await expect(b.locator('.room .notice')).toContainText('SOLD');
  releaseRunning();await handledRunning;await b.unroute('**/api/v1/auctions/*');await expect(b.locator('.room .eyebrow')).toContainText('FINISHED');
  await expect(b.getByTestId('standing')).toHaveText('拍卖已结束，你获得成交');
  await losing.context().setOffline(false);await expect(losing.getByTestId('standing')).toHaveText('拍卖已结束，其他用户获得成交',{timeout:10000});
  await expect(losing.locator('.room .notice')).toContainText('110');await expect(losing.locator('aside section').first()).toContainText('总余额 1000');
  await expect(b.locator('aside section').first()).toContainText('总余额 890');await expect(b.locator('aside section').first()).toContainText('冻结 0');
  await expect(b.getByRole('button',{name:'提交出价'})).toBeDisabled();
  await typography(b,'FINISHED-human');
  const snipeTitle='Browser extension '+Date.now();await admin.getByLabel('名称',{exact:true}).fill(snipeTitle);await admin.getByLabel('时长（秒）').fill('4');await admin.getByRole('button',{name:'创建 DRAFT 拍品'}).click();await expect(admin.getByRole('heading',{name:snipeTitle})).toBeVisible();
  for(const page of [losing,b]){await page.getByRole('button',{name:'刷新列表',exact:true}).click();await page.getByRole('button',{name:new RegExp(snipeTitle)}).click();await page.getByRole('button',{name:'加入拍卖',exact:true}).click();await expect(page.getByRole('status')).toContainText('已加入拍卖');}
  await admin.getByRole('button',{name:'开始拍卖',exact:true}).click();await expect(losing.locator('.room .eyebrow')).toContainText('RUNNING');
  const snipeResponse=losing.waitForResponse(r=>r.request().method()==='POST'&&/\/bids$/.test(new URL(r.url()).pathname));await losing.getByLabel('出价积分').fill('110');await losing.getByRole('button',{name:'提交出价'}).click();expect((await(await snipeResponse).json()).extended).toBe(true);
  for(const page of [losing,b]){await expect(page.locator('.room .stats .price').first()).toHaveText('110');await expect(page.locator('.room')).toContainText('已延时 1/3');}
  expect(await losing.getByText(/^截止 /).textContent()).toBe(await b.getByText(/^截止 /).textContent());await admin.getByRole('button',{name:'取消拍卖',exact:true}).click();await expect(losing.locator('aside section').first()).toContainText('冻结 0');
  // Verify real desktop layout and locally scrolling regions without dropping business assertions.
  for(const viewport of [{width:1440,height:900},{width:1920,height:1080}]){
    await admin.setViewportSize(viewport);
    const layout=await admin.evaluate(()=>({width:innerWidth,height:innerHeight,bodyWidth:document.documentElement.scrollWidth,bodyHeight:document.documentElement.scrollHeight,listOverflow:getComputedStyle(document.querySelector('.auction-list-scroll')).overflowY,inspectorOverflow:getComputedStyle(document.querySelector('.inspector-scroll')).overflowY}));
    expect(layout.bodyWidth).toBeLessThanOrEqual(viewport.width);expect(layout.bodyHeight).toBeLessThanOrEqual(viewport.height);
    expect(layout.listOverflow).toBe('auto');expect(layout.inspectorOverflow).toBe('auto');
    for(const locator of [admin.locator('.room .stats'),admin.getByRole('button',{name:'提交出价',exact:true}),admin.locator('.inspector-tabs')]){const box=await locator.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);}
    console.log(JSON.stringify({scenario:'console-layout',...layout}));
  }
  await admin.getByRole('tab',{name:'出价历史',exact:true}).click();
  await admin.getByRole('tab',{name:'出价历史',exact:true}).press('ArrowRight');
  await expect(admin.getByRole('tab',{name:'资金流水',exact:true})).toBeFocused();
  await expect(admin.getByRole('table',{name:'资金流水',exact:true})).toBeVisible();
  await admin.getByRole('tab',{name:'Agent',exact:true}).click();
  await expect(admin.getByLabel('新 Agent 邮箱',{exact:true})).toBeVisible();
  await expect(admin.getByLabel('名称',{exact:true})).toHaveCount(0);
  await admin.getByLabel('新 Agent 邮箱',{exact:true}).fill('ui-agent-'+Date.now()+'@example.test');
  await admin.getByLabel('初始密码（至少 12 位）',{exact:true}).fill(randomBytes(24).toString('hex'));
  const agentCreated=admin.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/admin/users'));
  await admin.getByRole('button',{name:'创建 Agent 用户',exact:true}).click();
  const agentUser=await(await agentCreated).json();
  await expect(admin.getByLabel('Agent 用户 ID',{exact:true})).toHaveValue(String(agentUser.id));
  const tokenIssued=admin.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/admin/agent-tokens'));
  await admin.getByRole('button',{name:'签发本场受限 Token',exact:true}).click();
  const scopedToken=await(await tokenIssued).json();
  expect(await admin.getByLabel('一次性 Agent Token',{exact:true}).inputValue()===scopedToken.token).toBe(true);
  await admin.getByRole('button',{name:'隐藏 Token',exact:true}).click();
  await expect(admin.getByLabel('一次性 Agent Token',{exact:true})).toHaveCount(0);
  const revoked=await admin.evaluate(async id=>(await fetch('/api/v1/admin/agent-tokens/'+id+'/revoke',{method:'POST',headers:{Authorization:'Bearer '+sessionStorage.getItem('bid-arena-token'),'Content-Type':'application/json'},body:'{}'})).status,scopedToken.id);
  expect(revoked).toBe(200);
  console.log('PASS console tabs: admin form separation, keyboard navigation, real Agent creation, scoped issuance/hide/revoke; credentials omitted');
  expect(errors).toEqual([]);
  console.log('PASS browser: admin create/start/cancel; two independent users; join/bid/history; remote update; offline/reconnect; wallet release; delayed private response across logout/login; automatic SOLD result and wallet debit; no page errors');
  for(const context of contexts)await context.close();
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
