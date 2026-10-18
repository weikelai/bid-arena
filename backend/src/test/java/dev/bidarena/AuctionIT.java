package dev.bidarena;

import org.junit.jupiter.api.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static dev.bidarena.Sql.*;

class AuctionIT {
    static Database db; static AuctionService service;static String schema,url,user,password;static long admin,a,b;
    @BeforeAll static void setup()throws Exception {
        url=Objects.requireNonNull(System.getenv("TEST_DB_URL"));user=System.getenv("TEST_DB_USER");password=System.getenv("TEST_DB_PASSWORD");
        schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        String base=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1),query=url.contains("?")?url.substring(url.indexOf('?')):"";
        db=new Database(new AppConfig(base+schema+query,user,password,"development",true));db.migrations().migrate();new DemoSeeder().initialize(db);service=new AuctionService(db);
        try(var c=db.connection()){admin=number(one(c,"SELECT id FROM users WHERE email='admin@example.com'"),"id");a=number(one(c,"SELECT id FROM users WHERE email='bidder_a@example.com'"),"id");b=number(one(c,"SELECT id FROM users WHERE email='bidder_b@example.com'"),"id");}
    }
    @AfterAll static void cleanup()throws Exception {if(db!=null)db.close();if(schema!=null&&schema.matches("bid_arena_it_[a-f0-9]{32}"))try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}}
    long auction()throws Exception {long id=service.create(admin,"test",180);service.join(id,a);service.join(id,b);return id;}
    long scalar(String sql,Object...args)throws Exception{try(var c=db.connection()){return ((Number)one(c,sql,args).values().iterator().next()).longValue();}}
    String key(){return UUID.randomUUID().toString();}
    void due(long id,int extension)throws Exception{try(var c=db.connection()){update(c,"UPDATE auctions SET end_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 4 SECOND),extension_count=? WHERE id=?",extension,id);}}
    @Test void rejectsAndIdempotencyPreserveMoney()throws Exception {
        long id=auction();String request=key();assertEquals("INVALID_STATE",service.bid(id,a,request,110).get("error"));service.start(id);
        assertEquals("INVALID_STATE",service.bid(id,a,request,110).get("error"));assertEquals(true,service.bid(id,a,request,110).get("replayed"));
        assertThrows(Fault.class,()->service.bid(id,a,request,120));
        assertEquals("BID_TOO_LOW",service.bid(id,a,key(),100).get("error"));assertEquals("INSUFFICIENT_FUNDS",service.bid(id,a,key(),1001).get("error"));
        assertEquals(0,scalar("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));assertEquals(0,scalar("SELECT SUM(frozen_balance) FROM wallets"));service.cancel(id);
    }
    @Test void differentialReleaseAndUniqueCapture()throws Exception {
        long id=auction();service.start(id);assertEquals("BID_ACCEPTED",service.bid(id,a,key(),110).get("type"));service.bid(id,a,key(),120);
        assertEquals(120,scalar("SELECT amount FROM auction_holds WHERE auction_id=? AND user_id=?",id,a));
        assertEquals(10,scalar("SELECT delta_frozen FROM wallet_transactions WHERE auction_id=? AND type='FREEZE' ORDER BY id DESC LIMIT 1",id));
        service.bid(id,b,key(),130);assertEquals(0,scalar("SELECT amount FROM auction_holds WHERE auction_id=? AND user_id=?",id,a));
        try(var c=db.connection()){update(c,"UPDATE auctions SET end_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?",id);}
        ExecutorService pool=Executors.newFixedThreadPool(4);try{var jobs=new ArrayList<Future<?>>();for(int i=0;i<4;i++)jobs.add(pool.submit(()->{try{new AuctionService(db).settle(id);}catch(Exception e){throw new RuntimeException(e);}}));for(var j:jobs)j.get(10,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
        assertEquals(1,scalar("SELECT COUNT(*) FROM auction_results WHERE auction_id=?",id));assertEquals(1,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='CAPTURE'",id));assertEquals(0,scalar("SELECT SUM(amount) FROM auction_holds WHERE auction_id=?",id));assertThrows(Fault.class,()->service.cancel(id));reconcile();
    }
    @Test void concurrentDuplicateProducesOneBid()throws Exception {
        long id=auction();service.start(id);String request=key();var pool=Executors.newFixedThreadPool(6);
        try{var jobs=new ArrayList<Future<Map<String,Object>>>();for(int i=0;i<6;i++)jobs.add(pool.submit(()->service.bid(id,a,request,110)));for(var j:jobs)assertEquals("BID_ACCEPTED",j.get(10,TimeUnit.SECONDS).get("type"));}finally{pool.shutdownNow();}
        assertEquals(1,scalar("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));assertEquals(1,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='FREEZE'",id));service.cancel(id);reconcile();
    }
    @Test void competingUsersAndSharedWallets()throws Exception {
        long x=auction(),y=auction();service.start(x);service.start(y);var pool=Executors.newFixedThreadPool(3);
        try {var jobs=List.of(pool.submit(()->service.bid(x,a,key(),600)),pool.submit(()->service.bid(x,b,key(),600)),pool.submit(()->service.bid(y,a,key(),600)));for(var j:jobs)j.get(10,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
        assertEquals(1,scalar("SELECT COUNT(*) FROM auction_holds WHERE auction_id=? AND amount>0",x));reconcile();service.cancel(x);service.cancel(y);reconcile();
    }
    @Test void extendsThreeTimesAndStillAcceptsAtLimit()throws Exception {
        long id=auction();service.start(id);
        for(int i=0;i<4;i++){due(id,Math.min(i,3));var before=service.snapshot(id).get("end_at");var out=service.bid(id,a,key(),110+i*10);assertEquals(i<3,out.get("extended"));if(i<3)assertEquals(java.time.Instant.parse((String)before).plusSeconds(10).toString(),service.snapshot(id).get("end_at"));}
        assertEquals(3,scalar("SELECT extension_count FROM auctions WHERE id=?",id));service.cancel(id);reconcile();
    }
    @Test void durableReceiptSurvivesLockWaitAcrossDeadline()throws Exception {
        long id=auction();service.start(id);due(id,3);var pool=Executors.newSingleThreadExecutor();
        try(var locked=db.connection()){locked.setAutoCommit(false);one(locked,"SELECT id FROM auctions WHERE id=? FOR UPDATE",id);
            var submitted=pool.submit(()->service.bid(id,a,key(),110));
            Thread.sleep(4500);locked.commit();assertEquals("BID_ACCEPTED",submitted.get(10,TimeUnit.SECONDS).get("type"));
        }finally{pool.shutdownNow();}service.settle(id);reconcile();
    }
    @Test void deadlineEqualIsRejectedAndRestartScannerFinishesEmptyAuction()throws Exception {
        long id=auction();service.start(id);String request=key();
        try(var c=db.connection()){update(c,"UPDATE auctions SET end_at='2020-01-01 00:00:00' WHERE id=?",id);update(c,"INSERT INTO bid_requests(user_id,request_id,auction_id,payload_hash,received_at,amount) VALUES(?,?,?,?,'2020-01-01 00:00:00',110)",a,request,id,Api.digest(id+":110"));}
        new AuctionService(db).tick();assertEquals("AUCTION_ENDED",org.noear.snack4.ONode.ofJson((String)read("SELECT response_json FROM bid_requests WHERE request_id=?",request)).get("error").getString());
        assertEquals("NO_BIDS",read("SELECT reason FROM auction_results WHERE auction_id=?",id));service.settle(id);assertEquals(1,scalar("SELECT COUNT(*) FROM auction_results WHERE auction_id=?",id));
    }
    @Test void failureAfterWalletWritesRollsBackAndPendingReceiptRecovers()throws Exception {
        long id=auction();service.start(id);String request=key();
        long frozen=scalar("SELECT SUM(frozen_balance) FROM wallets");
        AuctionService failing=new AuctionService(db,point->{if(point.equals("bid.afterMoney"))throw new SQLException("injected bid failure");});
        try {assertThrows(SQLException.class,()->failing.bid(id,a,request,110));assertEquals(frozen,scalar("SELECT SUM(frozen_balance) FROM wallets"));assertEquals(0,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));assertEquals(100,scalar("SELECT current_price FROM auctions WHERE id=?",id));}
        finally{ /* Recovery is exercised below with a fresh executor. */ }
        // New executor represents recovery without any in-memory request state.
        new AuctionService(db).tick();assertEquals(1,scalar("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));
        service.cancel(id);reconcile();
    }
    @Test void settlementFailureRollsBackCaptureAndNewExecutorRecovers()throws Exception {
        long id=auction();service.start(id);service.bid(id,a,key(),110);
        try(var c=db.connection()){update(c,"UPDATE auctions SET end_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?",id);}
        AuctionService failing=new AuctionService(db,point->{if(point.equals("settlement.afterMoney"))throw new SQLException("injected settlement failure");});
        try{assertThrows(SQLException.class,()->failing.settle(id));assertEquals(0,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='CAPTURE'",id));assertEquals(110,scalar("SELECT amount FROM auction_holds WHERE auction_id=? AND user_id=?",id,a));}
        finally{ /* Recovery is exercised below with a fresh executor. */ }
        new AuctionService(db).tick();assertEquals(1,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='CAPTURE'",id));reconcile();
    }
    Object read(String sql,Object...args)throws Exception{try(var c=db.connection()){return one(c,sql,args).values().iterator().next();}}
    @Test void processDeathDuringSettlementRollsBackAndScannerRecovers()throws Exception {
        long id=auction();service.start(id);service.bid(id,a,key(),110);
        try(var c=db.connection()){update(c,"UPDATE auctions SET end_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?",id);}
        String base=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1),query=url.contains("?")?url.substring(url.indexOf('?')):"";
        var boot=new ProcessBuilder(java.nio.file.Path.of(System.getProperty("java.home"),"bin","java").toString(),"-cp",System.getProperty("surefire.test.class.path",System.getProperty("java.class.path")),CrashWorker.class.getName(),""+id);
        boot.environment().put("CRASH_DB_URL",base+schema+query);
        Process child=boot.redirectErrorStream(true).redirectOutput(new java.io.File("target/crash-recovery.log")).start();
        try{assertTrue(child.waitFor(20,TimeUnit.SECONDS));assertEquals(73,child.exitValue());}finally{if(child.isAlive())child.destroyForcibly();}
        assertEquals(0,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='CAPTURE'",id));
        assertEquals(110,scalar("SELECT amount FROM auction_holds WHERE auction_id=? AND user_id=?",id,a));
        new AuctionService(db).tick();new AuctionService(db).tick();
        assertEquals(1,scalar("SELECT COUNT(*) FROM auction_results WHERE auction_id=?",id));
        assertEquals(1,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='CAPTURE'",id));reconcile();
    }
    public static class CrashWorker {
        public static void main(String[] args)throws Exception {
            var database=new Database(new AppConfig(System.getenv("CRASH_DB_URL"),System.getenv("TEST_DB_USER"),System.getenv("TEST_DB_PASSWORD"),"development",false));
            new AuctionService(database,point->{if(point.equals("settlement.afterMoney"))Runtime.getRuntime().halt(73);}).settle(Long.parseLong(args[0]));
            throw new AssertionError("Crash hook not reached");
        }
    }
    @Test void concurrentSnipesUseLatestDeadlineOnlyOnce()throws Exception {
        long id=auction();service.start(id);due(id,0);String before=(String)service.snapshot(id).get("end_at");
        var pool=Executors.newFixedThreadPool(2);
        try{var first=pool.submit(()->service.bid(id,a,key(),110));var second=pool.submit(()->service.bid(id,b,key(),120));first.get(10,TimeUnit.SECONDS);second.get(10,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
        assertEquals(1,scalar("SELECT extension_count FROM auctions WHERE id=?",id));
        assertEquals(java.time.Instant.parse(before).plusSeconds(10).toString(),service.snapshot(id).get("end_at"));
        service.cancel(id);reconcile();
    }
    @Test void settlingCannotCancelAndFinishedCannotBid()throws Exception {
        long id=auction();service.start(id);
        try(var c=db.connection()){update(c,"UPDATE auctions SET status='SETTLING' WHERE id=?",id);}
        assertThrows(Fault.class,()->service.cancel(id));
        assertEquals("INVALID_STATE",service.bid(id,a,key(),110).get("error"));
        service.settle(id);assertEquals("FINISHED",service.snapshot(id).get("status"));
        assertEquals("INVALID_STATE",service.bid(id,b,key(),110).get("error"));
        assertEquals(0,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));reconcile();
    }
    @Test void retryAfterActualWalletLockTimeoutHasOneEffect()throws Exception {
        // Configure only this fixture's pool sessions, never the server/global setting.
        var sessions=new ArrayList<Connection>();
        try{for(int i=0;i<8;i++){var c=db.connection();sessions.add(c);update(c,"SET SESSION innodb_lock_wait_timeout=1");}}finally{for(var c:sessions)c.close();}
        long id=auction();service.start(id);String request=key();var pool=Executors.newSingleThreadExecutor();
        try(var locked=db.connection()){
            locked.setAutoCommit(false);one(locked,"SELECT user_id FROM wallets WHERE user_id=? FOR UPDATE",a);
            var pending=pool.submit(()->service.bid(id,a,request,110));
            var error=assertThrows(ExecutionException.class,()->pending.get(15,TimeUnit.SECONDS));
            assertInstanceOf(SQLException.class,error.getCause());assertEquals(1205,((SQLException)error.getCause()).getErrorCode());
            assertEquals(0,scalar("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));
            assertEquals(0,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));locked.rollback();
            assertEquals("BID_ACCEPTED",service.bid(id,a,request,110).get("type"));
            assertEquals(true,service.bid(id,a,request,110).get("replayed"));
            assertEquals(1,scalar("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));service.cancel(id);reconcile();
        }finally{pool.shutdownNow();sessions.clear();try{for(int i=0;i<8;i++){var c=db.connection();sessions.add(c);update(c,"SET SESSION innodb_lock_wait_timeout=50");}}finally{for(var c:sessions)c.close();}}
    }
    @Test void deadlockVictimRetryRollsBackBeforeOneAcceptedEffect()throws Exception {
        long id=auction();service.start(id);String request=key();var count=new java.util.concurrent.atomic.AtomicInteger();
        var retrying=new AuctionService(db,point->{if(point.equals("bid.afterMoney")&&count.getAndIncrement()==0)throw new SQLException("injected deadlock victim","40001",1213);});
        assertEquals("BID_ACCEPTED",retrying.bid(id,a,request,110).get("type"));
        assertEquals(2,count.get());assertEquals(1,scalar("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));
        assertEquals(1,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='FREEZE'",id));service.cancel(id);reconcile();
    }
    @Test void privateWalletSnapshotKeepsLedgerAndHoldInOneVersion()throws Exception {
        long id=auction();service.start(id);service.bid(id,a,key(),110);
        var api=new Api(db);var before=api.walletSnapshot(a);assertEquals(a,number(before,"user_id"));
        service.bid(id,b,key(),120);var after=api.walletSnapshot(a);
        assertEquals(number(before,"total_balance"),number(after,"total_balance"));
        assertTrue(number(after,"version")>number(before,"version"));
        var ledger=(List<Map<String,Object>>)after.get("transactions");
        assertTrue(ledger.stream().allMatch(t->number(t,"user_id")==a));
        assertEquals(number(after,"total_balance"),ledger.stream().mapToLong(t->number(t,"delta_total")).sum());
        assertEquals(number(after,"frozen_balance"),ledger.stream().mapToLong(t->number(t,"delta_frozen")).sum());
        service.cancel(id);reconcile();
    }
    void reconcile()throws Exception {
        assertEquals(0,scalar("SELECT COUNT(*) FROM wallets w WHERE frozen_balance<>(SELECT COALESCE(SUM(amount),0) FROM auction_holds h WHERE h.user_id=w.user_id) OR total_balance<>(SELECT SUM(delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT SUM(delta_frozen) FROM wallet_transactions t WHERE t.user_id=w.user_id)"));
    }
}
