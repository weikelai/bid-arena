package dev.bidarena;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.sql.*;
import java.util.*;
import static dev.bidarena.Sql.*;

/** Coordination only. Workers never receive database or administrator credentials. */
final class AgentJobs {
 static final java.util.concurrent.Semaphore submissions=new java.util.concurrent.Semaphore(3,true);
 final Database db;
 AgentJobs(Database db){this.db=db;}
 static long integer(Map<String,Object>b,String k,long fallback){Object v=b.get(k);if(v==null)return fallback;if(!(v instanceof Number n)||n instanceof Double||n instanceof Float||n instanceof java.math.BigDecimal)throw new Fault(400,"INVALID_AGENT_CONFIG");try{return new java.math.BigInteger(n.toString()).longValueExact();}catch(ArithmeticException e){throw new Fault(400,"INVALID_AGENT_CONFIG");}}
 static String string(Map<String,Object>b,String k){if(!(b.get(k) instanceof String s))throw new Fault(400,"INVALID_AGENT_CONFIG");return s;}
 void worker(String supplied){String expected=System.getenv("AGENT_CONTROL_SECRET");if(expected==null||expected.length()<32||supplied==null||!java.security.MessageDigest.isEqual(("Bearer "+expected).getBytes(java.nio.charset.StandardCharsets.UTF_8),supplied.getBytes(java.nio.charset.StandardCharsets.UTF_8)))throw new Fault(403,"WORKER_DENIED");}
 void vault(String id,String token){
  String target=System.getenv("AGENT_WORKER_URL"),secret=System.getenv("AGENT_CONTROL_SECRET");
  if(target==null||secret==null)throw new Fault(503,"AGENT_WORKER_UNAVAILABLE");
  var request=HttpRequest.newBuilder(URI.create(target+"/vault")).timeout(Duration.ofSeconds(5)).header("Authorization","Bearer "+secret).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json(Map.of("id",id,"token",token)))).build();
  try{if(HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.discarding()).statusCode()!=204)throw new Fault(503,"AGENT_WORKER_UNAVAILABLE");}
  catch(InterruptedException e){Thread.currentThread().interrupt();throw new Fault(503,"AGENT_WORKER_UNAVAILABLE");}
  catch(java.io.IOException e){throw new Fault(503,"AGENT_WORKER_UNAVAILABLE");}
 }
 void discardVault(String id){
  String target=System.getenv("AGENT_WORKER_URL"),secret=System.getenv("AGENT_CONTROL_SECRET");
  if(target==null||secret==null)return;
  var request=HttpRequest.newBuilder(URI.create(target+"/vault/"+id)).timeout(Duration.ofSeconds(5)).header("Authorization","Bearer "+secret).DELETE().build();
  try{HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.discarding());}catch(InterruptedException e){Thread.currentThread().interrupt();}catch(java.io.IOException ignored){}
 }
 Object launch(long admin,Map<String,Object>b)throws SQLException{
  String name=string(b,"name").strip(),request=string(b,"requestId"),strategy=string(b,"strategy");
  long auction=integer(b,"auctionId",0),max=integer(b,"maxBidAmount",0),count=integer(b,"maxBids",10);
  if(!request.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")||name.isBlank()||name.length()>80||auction<1||max<110||max>1000||count<1||count>10000||!Set.of("BALANCED","CONSERVATIVE","MONITOR").contains(strategy))throw new Fault(400,"INVALID_AGENT_CONFIG");
  byte[] hash=Api.digest(json(List.of(name,auction,max,count,strategy)));
  String[] provisioned={null};
  try{return db.transaction(c->{
   update(c,"INSERT INTO agent_job_creations(admin_id,request_id,config_hash) VALUES(?,?,?) ON DUPLICATE KEY UPDATE request_id=request_id",admin,request,hash);
   var receipt=one(c,"SELECT * FROM agent_job_creations WHERE admin_id=? AND request_id=? FOR UPDATE",admin,request);
   if(!java.security.MessageDigest.isEqual((byte[])receipt.get("config_hash"),hash))throw new Fault(409,"IDEMPOTENCY_CONFLICT");
   if(receipt.get("job_id")!=null)return Map.of("id",receipt.get("job_id"),"replayed",true);
   var room=one(c,"SELECT status FROM auctions WHERE id=? FOR SHARE",auction);
   if(!Set.of("DRAFT","RUNNING").contains(room.get("status")))throw new Fault(409,"AUCTION_NOT_OPEN");
   String id=UUID.randomUUID().toString();byte[] bytes=new byte[32];new java.security.SecureRandom().nextBytes(bytes);String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
   // Provision the encrypted credential first; rollback attempts to remove it.
   provisioned[0]=id;
   vault(id,token);
   char[] password=UUID.randomUUID().toString().toCharArray();String passwordHash;
   try{passwordHash=new PasswordHasher().hash(password);}finally{Arrays.fill(password,'\0');}
   long user,tid;
  try(var p=Sql.prepare(c,"INSERT INTO users(email,password_hash,role,kind) VALUES(?,?,'BIDDER','AGENT')","agent-"+id+"@bid-arena.invalid",passwordHash)){p.executeUpdate();try(var r=p.getGeneratedKeys()){r.next();user=r.getLong(1);}}
   update(c,"INSERT INTO wallets(user_id,total_balance) VALUES(?,1000)",user);
   update(c,"INSERT INTO wallet_transactions(user_id,effect_key,type,delta_total,delta_frozen,total_after,frozen_after) VALUES(?,?,'INITIAL_CREDIT',1000,0,1000,0)",user,"initial/"+user);
   try(var p=Sql.prepare(c,"INSERT INTO agent_tokens(digest,user_id,expires_at,rate_limit) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 1 HOUR),120)",Api.digest(token),user)){p.executeUpdate();try(var r=p.getGeneratedKeys()){r.next();tid=r.getLong(1);}}
   update(c,"INSERT INTO agent_token_scopes(token_id,auction_id,permission) VALUES(?,?,'auction:read')",tid,auction);
   if(!strategy.equals("MONITOR"))update(c,"INSERT INTO agent_token_scopes(token_id,auction_id,permission) VALUES(?,?,'auction:bid')",tid,auction);
   update(c,"INSERT INTO agent_jobs(id,name,user_id,auction_id,token_id,max_bid,max_bids,poll_ms,timeout_ms,max_errors,strategy,desired,state) VALUES(?,?,?,?,?,?,?,?,5000,10,?,'RUNNING',?)",id,name,user,auction,tid,max,count,strategy.equals("CONSERVATIVE")?10000:3000,strategy,room.get("status").equals("DRAFT")?"WAITING":"STARTING");
   update(c,"UPDATE agent_job_creations SET job_id=? WHERE admin_id=? AND request_id=?",id,admin,request);
   event(c,id,"CREATED","Created and scheduled; credentials omitted");
   return Map.of("id",id,"replayed",false);
  });}catch(SQLException|RuntimeException e){
   // A connection loss during commit has an ambiguous outcome. Only delete the
   // ciphertext after a fresh connection confirms there is no committed job.
   if(provisioned[0]!=null)try(var c=db.connection()){
    if(number(one(c,"SELECT COUNT(*) n FROM agent_jobs WHERE id=?",provisioned[0]),"n")==0)discardVault(provisioned[0]);
   }catch(SQLException cleanup){e.addSuppressed(cleanup);}
   throw e;
  }
 }
 Object create(Map<String,Object>b)throws Exception{
  String name=string(b,"name"),token=string(b,"token"),id=UUID.randomUUID().toString();
  long user=integer(b,"userId",0),auction=integer(b,"auctionId",0),max=integer(b,"maxBidAmount",0),count=integer(b,"maxBids",20),poll=integer(b,"pollMs",3000),timeout=integer(b,"timeoutMs",5000),errors=integer(b,"maxErrors",10);
  if(name.isBlank()||name.length()>80||!token.matches("[A-Za-z0-9_-]{43}")||user<1||auction<1||max<110||max>1000000000||count<1||count>10000||poll<3000||poll>60000||timeout<1000||timeout>10000||errors<1||errors>100)throw new Fault(400,"INVALID_AGENT_CONFIG");
  long tid;
  try(var c=db.connection()){
   var t=one(c,"SELECT t.id FROM agent_tokens t JOIN users u ON u.id=t.user_id WHERE t.digest=? AND t.user_id=? AND u.kind='AGENT' AND u.status='ACTIVE' AND t.revoked_at IS NULL AND t.expires_at>UTC_TIMESTAMP(6)",Api.digest(token),user);tid=number(t,"id");
   if(number(one(c,"SELECT COUNT(DISTINCT permission) n FROM agent_token_scopes WHERE token_id=? AND auction_id=? AND permission IN ('auction:read','auction:bid')",tid,auction),"n")!=2)throw new Fault(403,"SCOPE_DENIED");
  }
  String target=System.getenv("AGENT_WORKER_URL"),secret=System.getenv("AGENT_CONTROL_SECRET");
  if(target==null||secret==null)throw new Fault(503,"AGENT_WORKER_UNAVAILABLE");
  // Private control channel. Neither returned metadata nor SQL contains plaintext.
  var request=HttpRequest.newBuilder(URI.create(target+"/vault")).timeout(Duration.ofSeconds(5)).header("Authorization","Bearer "+secret).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(json(Map.of("id",id,"token",token)))).build();
  try{if(HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.discarding()).statusCode()!=204)throw new Fault(503,"AGENT_WORKER_UNAVAILABLE");}catch(java.io.IOException e){throw new Fault(503,"AGENT_WORKER_UNAVAILABLE");}
  return db.transaction(c->{update(c,"INSERT INTO agent_jobs(id,name,user_id,auction_id,token_id,max_bid,max_bids,poll_ms,timeout_ms,max_errors) VALUES(?,?,?,?,?,?,?,?,?,?)",id,name,user,auction,tid,max,count,poll,timeout,errors);event(c,id,"CREATED","Configuration created; token omitted");return Map.of("id",id);});
 }
 Object list()throws SQLException{try(var c=db.connection()){return rows(c,"SELECT j.*,a.title auction_title,a.status auction_status,a.current_price live_price,a.leader_id live_leader,t.expires_at token_expires_at,t.revoked_at token_revoked_at,t.expires_at<=UTC_TIMESTAMP(6) token_expired,(a.leader_id=j.user_id) `leading`,UTC_TIMESTAMP(6) server_time,CASE WHEN lease_until>UTC_TIMESTAMP(6) THEN 'PROCESSING' WHEN last_decision IS NULL THEN 'UNCONFIRMED' WHEN next_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 30 SECOND) AND desired='RUNNING' AND state NOT IN ('FINISHED','ERROR') THEN 'STALE' ELSE 'CONFIRMED' END worker_status,COALESCE((SELECT amount FROM auction_holds h WHERE h.auction_id=j.auction_id AND h.user_id=j.user_id),0) held_amount,COALESCE((SELECT -SUM(delta_total) FROM wallet_transactions w WHERE w.user_id=j.user_id AND w.auction_id=j.auction_id AND w.type='CAPTURE'),0) spent_amount FROM agent_jobs j JOIN auctions a ON a.id=j.auction_id JOIN agent_tokens t ON t.id=j.token_id ORDER BY j.created_at DESC LIMIT 100");}}
 Object history(String id)throws SQLException{try(var c=db.connection()){return rows(c,"SELECT type,detail,created_at FROM agent_job_events WHERE job_id=? ORDER BY id DESC LIMIT 100",id);}}
 static void event(Connection c,String id,String type,String detail)throws SQLException{update(c,"INSERT INTO agent_job_events(job_id,type,detail) VALUES(?,?,?)",id,type,detail);}
 Object control(String id,String action,Map<String,Object>b)throws SQLException{return db.transaction(c->{var j=one(c,"SELECT * FROM agent_jobs WHERE id=? FOR UPDATE",id);
  switch(action){
   case "start" -> {if("FINISHED".equals(j.get("state")))throw new Fault(409,"AGENT_TERMINAL");if(number(one(c,"SELECT COUNT(*) n FROM agent_tokens WHERE id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(6)",j.get("token_id")),"n")!=1)throw new Fault(409,"AGENT_TOKEN_INACTIVE");if(!"RUNNING".equals(j.get("desired"))||"ERROR".equals(j.get("state")))update(c,"UPDATE agent_jobs SET desired='RUNNING',error_count=0,state=IF(pending_id IS NULL,'STARTING','STOPPING'),next_at=UTC_TIMESTAMP(6) WHERE id=?",id);}
   case "pause","stop","revoke" -> {String desired=action.equals("pause")?"PAUSED":"STOPPED";if(action.equals("revoke"))update(c,"UPDATE agent_tokens SET revoked_at=UTC_TIMESTAMP(6) WHERE id=?",j.get("token_id"));update(c,"UPDATE agent_jobs SET desired=?,state=IF(pending_id IS NULL,?,'STOPPING'),next_at=UTC_TIMESTAMP(6) WHERE id=?",desired,desired,id);}
   case "configure" -> {if(!Set.of("STOPPED","PAUSED").contains(j.get("state"))||j.get("pending_id")!=null)throw new Fault(409,"STOP_AGENT_FIRST");long max=integer(b,"maxBidAmount",number(j,"max_bid")),count=integer(b,"maxBids",number(j,"max_bids"));if(max<110||max>1000000000||count<Math.max(1,number(j,"bid_count"))||count>10000)throw new Fault(400,"INVALID_AGENT_CONFIG");update(c,"UPDATE agent_jobs SET max_bid=?,max_bids=? WHERE id=?",max,count,id);}
   default -> throw new Fault(400,"INVALID_AGENT_ACTION");
  }event(c,id,"CONTROL",action);return Map.of("ok",true);
 });}
 Object claim(String owner)throws SQLException{
  if(!owner.matches("[a-zA-Z0-9-]{1,64}"))throw new Fault(400,"INVALID_WORKER");
  return db.transaction(c->{var candidates=rows(c,"SELECT * FROM agent_jobs WHERE ((desired='RUNNING' AND state NOT IN ('FINISHED','ERROR')) OR pending_id IS NOT NULL) AND next_at<=UTC_TIMESTAMP(6) AND (lease_until IS NULL OR lease_until<UTC_TIMESTAMP(6)) ORDER BY next_at LIMIT 1 FOR UPDATE SKIP LOCKED");if(candidates.isEmpty())return Map.of();var j=candidates.get(0);long epoch=number(j,"lease_epoch")+1;update(c,"UPDATE agent_jobs SET owner=?,lease_epoch=?,lease_until=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 60 SECOND) WHERE id=?",owner,epoch,j.get("id"));j.put("owner",owner);j.put("lease_epoch",epoch);return j;});
 }
 Map<String,Object> owned(Connection c,String id,Map<String,Object>b)throws SQLException{var j=one(c,"SELECT * FROM agent_jobs WHERE id=? FOR UPDATE",id);if(!Objects.equals(j.get("owner"),b.get("owner"))||number(j,"lease_epoch")!=integer(b,"epoch",-1)||number(one(c,"SELECT lease_until>UTC_TIMESTAMP(6) valid FROM agent_jobs WHERE id=?",id),"valid")!=1)throw new Fault(409,"LEASE_LOST");return j;}
 // Serialize stop/revoke/recovery against a managed submission. The existing money
 // transaction remains unchanged and commits before this coordination lock is released.
 Object bid(AuctionService service,Api.Principal p,long auction,String request,long amount)throws SQLException {
  String[] parts=request.split(":");if(parts.length!=3)throw new Fault(400,"INVALID_REQUEST_ID");
  if(!submissions.tryAcquire())throw new Fault(503,"AGENT_BUSY");
  try{return db.transaction(c->{var j=one(c,"SELECT * FROM agent_jobs WHERE id=? FOR UPDATE",parts[1]);
   if(p.agent()==null||p.agent()!=number(j,"token_id")||p.user()!=number(j,"user_id")||auction!=number(j,"auction_id"))throw new Fault(403,"SCOPE_DENIED");
   var receipts=rows(c,"SELECT amount,auction_id,state,response_json FROM bid_requests WHERE user_id=? AND request_id=?",p.user(),request);
   if(!receipts.isEmpty()){
    if(amount!=number(receipts.get(0),"amount")||auction!=number(receipts.get(0),"auction_id"))throw new Fault(409,"IDEMPOTENCY_CONFLICT");
    if(!"PENDING".equals(receipts.get(0).get("state"))){Map<String,Object> result=org.noear.snack4.ONode.deserialize((String)receipts.get(0).get("response_json"),Map.class);result.put("replayed",true);return result;}
    return service.bid(auction,p.user(),request,amount);
   }
   if(!Objects.equals(request,j.get("pending_id"))||amount!=number(j,"pending_amount")||!"RUNNING".equals(j.get("desired")))throw new Fault(409,"AGENT_STOPPED");
   if(number(one(c,"SELECT COUNT(*) n FROM agent_tokens WHERE id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(6)",p.agent()),"n")!=1)throw new Fault(401,"UNAUTHORIZED");
   return service.bid(auction,p.user(),request,amount);
  });}finally{submissions.release();}
 }
 Object recover(String id,Map<String,Object>b)throws SQLException{return db.transaction(c->{var j=owned(c,id,b);if(j.get("pending_id")==null)return Map.of("resolved",true,"detail","NO_PENDING");
  var receipts=rows(c,"SELECT state,response_json FROM bid_requests WHERE user_id=? AND request_id=?",j.get("user_id"),j.get("pending_id"));
  if(!receipts.isEmpty()){
   if("PENDING".equals(receipts.get(0).get("state")))return Map.of("resolved",false,"detail","INTAKE_PENDING");
   return Map.of("resolved",true,"detail",receipts.get(0).get("state"));
  }
  boolean active=number(one(c,"SELECT COUNT(*) n FROM agent_tokens WHERE id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(6)",j.get("token_id")),"n")==1;
  // Holding the same row as submit fences an already authenticated but delayed request.
  if(!active||!"RUNNING".equals(j.get("desired"))){update(c,"UPDATE agent_jobs SET desired=IF(desired='RUNNING','STOPPED',desired) WHERE id=?",id);return Map.of("resolved",true,"detail","FENCED_NO_EFFECT");}
  return Map.of("resolved",false,"detail","RETRY_SAME_REQUEST");
 });}
 Object prepare(String id,Map<String,Object>b)throws SQLException{return db.transaction(c->{var j=owned(c,id,b);if(j.get("pending_id")!=null)return Map.of("requestId",j.get("pending_id"),"amount",j.get("pending_amount"));long amount=integer(b,"amount",0);if("MONITOR".equals(j.get("strategy"))||!"RUNNING".equals(j.get("desired"))||amount<110||amount>number(j,"max_bid")||number(j,"bid_count")>=number(j,"max_bids"))throw new Fault(409,"AGENT_STOPPED_OR_BUDGET");String request="agent:"+id+":"+(number(j,"bid_count")+1);update(c,"UPDATE agent_jobs SET pending_id=?,pending_amount=?,bid_count=bid_count+1 WHERE id=?",request,amount,id);event(c,id,"BID_PREPARED","amount="+amount);return Map.of("requestId",request,"amount",amount);});}
 Object report(String id,Map<String,Object>b)throws SQLException{return db.transaction(c->{var j=owned(c,id,b);String state=string(b,"state"),detail=string(b,"detail");if(!Set.of("WAITING","RUNNING","PAUSED","STOPPED","FINISHED","ERROR").contains(state)||!detail.matches("[A-Za-z0-9_ .:/=-]{1,180}"))throw new Fault(400,"INVALID_REPORT");boolean resolved=Boolean.TRUE.equals(b.get("resolved"));if(resolved&&j.get("pending_id")!=null&&!Objects.equals(j.get("pending_id"),b.get("requestId")))throw new Fault(409,"REQUEST_MISMATCH");boolean pending=j.get("pending_id")!=null&&!resolved;
  String error=b.get("error")==null?null:string(b,"error");if(error!=null&&!error.matches("[A-Z0-9_]{1,80}"))throw new Fault(400,"INVALID_REPORT");
  long errors=error==null?0:number(j,"error_count")+1;
  if(errors>=number(j,"max_errors")&&!pending)state="ERROR";
  if(!"RUNNING".equals(j.get("desired")))state=pending?"STOPPING":(String)j.get("desired");
  update(c,"UPDATE agent_jobs SET error_count=? WHERE id=?",errors,id);
  long delay=integer(b,"delayMs",number(j,"poll_ms"));delay=Math.max(3000,Math.min(120000,delay));
  update(c,"UPDATE agent_jobs SET state=?,pending_id=IF(?,NULL,pending_id),pending_amount=IF(?,NULL,pending_amount),last_result=?,last_error=?,current_price=?,leader_id=?,final_result=?,last_decision=UTC_TIMESTAMP(6),next_at=TIMESTAMPADD(MICROSECOND,?,UTC_TIMESTAMP(6)),owner=NULL,lease_until=NULL WHERE id=?",state,resolved,resolved,detail,b.get("error"),b.get("price"),b.get("leader"),b.get("result")==null?null:json(b.get("result")),delay*1000,id);
  event(c,id,"DECISION",detail);return Map.of("ok",true);
 });}
}
