package dev.bidarena;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.noear.solon.SolonApp;
import org.noear.solon.core.handle.Context;
import org.noear.snack4.ONode;
import static dev.bidarena.Sql.*;

/** HTTP authentication and authorization boundary; money is owned by AuctionService. */
public final class Api {
    private final Database db;
    private final AuctionService auctions;
    private final PasswordHasher passwords=new PasswordHasher();
    private final ScheduledExecutorService jobs=Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"auction-settlement");t.setDaemon(true);return t;});
    public Api(Database db){this.db=db;this.auctions=new AuctionService(db);}
    @FunctionalInterface interface Endpoint {Object run(Context c)throws Exception;}
    private void route(SolonApp app,String method,String path,Endpoint handler) {
        org.noear.solon.core.handle.Handler action=c->{long started=System.nanoTime();try {Object out=handler.run(c);c.outputAsJson(json(out));}
            catch(Fault e){c.status(e.status);c.outputAsJson(json(Map.of("error",e.code)));}
            catch(IllegalArgumentException e){c.status(400);c.outputAsJson(json(Map.of("error","INVALID_REQUEST")));}
            catch(Exception e){db.metrics.increment("http.systemErrors");System.err.println("API failure: "+e.getClass().getSimpleName());c.status(500);c.outputAsJson(json(Map.of("error","INTERNAL_ERROR")));}
            finally{db.metrics.observe("http.latency",System.nanoTime()-started);}};
        if(method.equals("GET"))app.get(path,action);else app.post(path,action);
    }
    public void register(SolonApp app) {
        route(app,"GET","/api/v1/admin/metrics",c->{admin(c);return db.metricsSnapshot();});
        app.get("/api/v1/openapi.json",c->{try(var stream=Api.class.getResourceAsStream("/openapi.json")){c.contentType("application/json");c.output(new String(Objects.requireNonNull(stream).readAllBytes(),StandardCharsets.UTF_8));}});
        route(app,"POST","/api/v1/auth/login",c->login(body(c)));
        route(app,"GET","/api/v1/users/me",c->{var p=human(c);return query("SELECT id,email,role,status,kind FROM users WHERE id=?",p.user).get(0);});
        route(app,"GET","/api/v1/wallets/me",c->{var p=human(c);return walletSnapshot(p.user);});
        route(app,"GET","/api/v1/auctions",c->{human(c);return query("SELECT * FROM auctions ORDER BY id DESC LIMIT 200");});
        route(app,"GET","/api/v1/auctions/{id}",c->{permit(c,id(c),"auction:read");return auctions.snapshot(id(c));});
        route(app,"GET","/api/v1/auctions/{id}/bids",c->{permit(c,id(c),"auction:read");return query("SELECT * FROM bids WHERE auction_id=? ORDER BY seq LIMIT 1000",id(c));});
        route(app,"GET","/api/v1/auctions/{id}/events",c->{var principal=permit(c,id(c),"auction:read");long after=Long.parseLong(c.paramOrDefault("after","0"));var events=query("SELECT auction_id auctionId,seq,type,server_time serverTime,payload FROM auction_events WHERE auction_id=? AND seq>? AND (visibility='PUBLIC' OR user_id=?) ORDER BY seq LIMIT 200",id(c),after,principal.user);long watermark=number(query("SELECT seq FROM auctions WHERE id=?",id(c)).get(0),"seq");return Map.of("events",events,"connectionState","CONNECTED","auctionId",id(c),"seq",watermark,"type","CONNECTION_STATE","serverTime",Instant.now().toString());});
        route(app,"POST","/api/v1/auctions/{id}/join",c->{var p=permit(c,id(c),"auction:bid");auctions.join(id(c),p.user);return Map.of("joined",true);});
        route(app,"POST","/api/v1/auctions/{id}/bids",c->{var p=permit(c,id(c),"auction:bid");var b=body(c);return auctions.bid(id(c),p.user,text(b,"requestId"),integer(b,"amount"));});
        route(app,"POST","/api/v1/admin/auctions",c->{var p=admin(c);var b=body(c);long duration=b.containsKey("durationSeconds")?integer(b,"durationSeconds"):180;if(duration<1||duration>86400)throw new Fault(400,"INVALID_AUCTION");return Map.of("id",auctions.create(p.user,text(b,"title"),(int)duration));});
        route(app,"POST","/api/v1/admin/auctions/{id}/start",c->{admin(c);auctions.start(id(c));return auctions.snapshot(id(c));});
        route(app,"POST","/api/v1/admin/auctions/{id}/cancel",c->{admin(c);auctions.cancel(id(c));return auctions.snapshot(id(c));});
        route(app,"POST","/api/v1/admin/agent-tokens",c->{admin(c);return issue(body(c));});
        route(app,"POST","/api/v1/admin/users",c->{admin(c);return createUser(body(c));});
        route(app,"POST","/api/v1/admin/agent-tokens/{id}/revoke",c->{admin(c);db.transaction(x->{update(x,"UPDATE agent_tokens SET revoked_at=UTC_TIMESTAMP(6) WHERE id=?",id(c));return null;});return Map.of("revoked",true);});
        jobs.scheduleWithFixedDelay(()->{try{auctions.tick();}catch(Exception e){System.err.println("Settlement scan failed: "+e.getClass().getSimpleName());}},1,1,TimeUnit.SECONDS);
        Runtime.getRuntime().addShutdownHook(new Thread(jobs::shutdownNow));
    }
    Map<String,Object> walletSnapshot(long user)throws SQLException {
        try(var c=db.connection()){
            c.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);c.setAutoCommit(false);
            var w=one(c,"SELECT *,total_balance-frozen_balance available_balance,UTC_TIMESTAMP(6) server_time FROM wallets WHERE user_id=?",user);
            w.put("transactions",rows(c,"SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 200",user));
            w.put("holds",rows(c,"SELECT auction_id,amount FROM auction_holds WHERE user_id=? AND amount>0",user));
            c.commit();return w;
        }
    }
    private Object login(Map<String,Object> b)throws SQLException {
        String email=text(b,"email"),password=text(b,"password");
        if(email.length()>254||password.length()>256)throw new Fault(400,"INVALID_REQUEST");
        var found=query("SELECT * FROM users WHERE email=? AND status='ACTIVE' AND kind='HUMAN'",email);
        if(found.isEmpty()||!passwords.verify(password.toCharArray(),(String)found.get(0).get("password_hash")))throw new Fault(401,"INVALID_CREDENTIALS");
        long user=number(found.get(0),"id");String token=randomToken();
        db.transaction(c->{update(c,"INSERT INTO auth_sessions(digest,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 8 HOUR))",digest(token),user);return null;});
        return Map.of("token",token,"role",found.get(0).get("role"),"userId",user);
    }
    private Object createUser(Map<String,Object> b)throws SQLException {
        String email=text(b,"email"),password=text(b,"password"),kind=text(b,"kind");
        if(!email.matches("[^ @]{1,100}@[^ @]{1,100}")||email.length()>254||password.length()<12||password.length()>128||!Set.of("AGENT","HUMAN").contains(kind))throw new Fault(400,"INVALID_USER");
        String hash=passwords.hash(password.toCharArray());
        long id=db.transaction(c->{long created;try(var p=prepare(c,"INSERT INTO users(email,password_hash,role,kind) VALUES(?,?,'BIDDER',?)",email,hash,kind)){p.executeUpdate();try(var r=p.getGeneratedKeys()){r.next();created=r.getLong(1);}}
            update(c,"INSERT INTO wallets(user_id,total_balance) VALUES(?,1000)",created);
            update(c,"INSERT INTO wallet_transactions(user_id,effect_key,type,delta_total,delta_frozen,total_after,frozen_after) VALUES(?,?,'INITIAL_CREDIT',1000,0,1000,0)",created,"initial/"+created);return created;});
        return Map.of("id",id,"email",email,"kind",kind);
    }
    record Principal(long user,String role,Long agent){}
    private Principal authenticate(Context c)throws SQLException {
        String h=c.header("Authorization");if(h==null||!h.startsWith("Bearer ")||h.length()>256)throw new Fault(401,"UNAUTHORIZED");byte[] hash=digest(h.substring(7));
        var sessions=query("SELECT u.id,u.role FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.digest=? AND s.expires_at>UTC_TIMESTAMP(6) AND u.status='ACTIVE'",hash);
        if(!sessions.isEmpty())return new Principal(number(sessions.get(0),"id"),(String)sessions.get(0).get("role"),null);
        return db.transaction(x->{var tokens=rows(x,"SELECT t.*,u.status FROM agent_tokens t JOIN users u ON u.id=t.user_id WHERE digest=? AND expires_at>UTC_TIMESTAMP(6) AND revoked_at IS NULL AND u.status='ACTIVE' FOR UPDATE",hash);
            if(tokens.isEmpty())throw new Fault(401,"UNAUTHORIZED");var t=tokens.get(0);long id=number(t,"id");
            update(x,"INSERT INTO agent_rate_windows(token_id,window_start,request_count) VALUES(?,FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(UTC_TIMESTAMP())/60)*60),1) ON DUPLICATE KEY UPDATE request_count=request_count+1",id);
            long count=number(one(x,"SELECT request_count FROM agent_rate_windows WHERE token_id=? AND window_start=FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(UTC_TIMESTAMP())/60)*60)",id),"request_count");
            // Rejected excess requests need not increase the already saturated counter.
            if(count>number(t,"rate_limit"))throw new Fault(429,"RATE_LIMITED");return new Principal(number(t,"user_id"),"BIDDER",id);
        });
    }
    private Principal human(Context c)throws SQLException {var p=authenticate(c);if(p.agent!=null)throw new Fault(403,"AGENT_SCOPE_REQUIRED");return p;}
    private Principal admin(Context c)throws SQLException {var p=human(c);if(!p.role.equals("ADMIN"))throw new Fault(403,"FORBIDDEN");return p;}
    private Principal permit(Context c,long auction,String permission)throws SQLException {var p=authenticate(c);if(p.agent!=null&&query("SELECT 1 FROM agent_token_scopes WHERE token_id=? AND auction_id=? AND permission=?",p.agent,auction,permission).isEmpty())throw new Fault(403,"SCOPE_DENIED");return p;}
    private Object issue(Map<String,Object> b)throws SQLException {
        long user=integer(b,"userId"),auction=integer(b,"auctionId"),seconds=b.containsKey("expiresInSeconds")?integer(b,"expiresInSeconds"):3600,rate=b.containsKey("rateLimit")?integer(b,"rateLimit"):60;
        if(seconds<1||seconds>86400*30||rate<1||rate>10000)throw new Fault(400,"INVALID_TOKEN_POLICY");
        Object input=b.get("permissions");if(!(input instanceof List<?> permissions)||permissions.isEmpty()||!permissions.stream().allMatch(v->Set.of("auction:read","auction:bid").contains(v)))throw new Fault(400,"INVALID_PERMISSIONS");
        String token=randomToken();long id=db.transaction(c->{var u=one(c,"SELECT kind FROM users WHERE id=? AND status='ACTIVE'",user);if(!"AGENT".equals(u.get("kind")))throw new Fault(400,"AGENT_USER_REQUIRED");
            long created;try(var p=prepare(c,"INSERT INTO agent_tokens(digest,user_id,expires_at,rate_limit) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL ? SECOND),?)",digest(token),user,seconds,rate)){p.executeUpdate();try(var r=p.getGeneratedKeys()){r.next();created=r.getLong(1);}}
            for(Object permission:new HashSet<>(permissions))update(c,"INSERT INTO agent_token_scopes(token_id,auction_id,permission) VALUES(?,?,?)",created,auction,permission);return created;});
        return Map.of("id",id,"token",token,"userId",user,"auctionId",auction);
    }
    private List<Map<String,Object>> query(String sql,Object...args)throws SQLException {try(var c=db.connection()){return rows(c,sql,args);}}
    private static Map<String,Object> body(Context c)throws Exception {try {Map<String,Object> value=ONode.deserialize(c.body(),Map.class);if(value==null)throw new Fault(400,"INVALID_REQUEST");return value;}catch(Fault e){throw e;}catch(Exception e){throw new Fault(400,"INVALID_JSON");}}
    private static String text(Map<String,Object>b,String k){if(!(b.get(k) instanceof String s))throw new Fault(400,"INVALID_"+k);return s;}
    private static long integer(Map<String,Object>b,String k){Object v=b.get(k);if(!(v instanceof Number n)||n instanceof Double||n instanceof Float||n instanceof java.math.BigDecimal)throw new Fault(400,"INVALID_"+k);try{return new java.math.BigInteger(n.toString()).longValueExact();}catch(Exception e){throw new Fault(400,"INVALID_"+k);}}
    private static long id(Context c){String[] segments=c.path().split("/");for(int i=segments.length-1;i>=0;i--)try{long id=Long.parseLong(segments[i]);if(id>0)return id;}catch(NumberFormatException ignored){}throw new Fault(400,"INVALID_ID");}
    private static String randomToken(){byte[] b=new byte[32];new SecureRandom().nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b);}
    static byte[] digest(String value){try{return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));}catch(NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}}
}
