package dev.bidarena;

import org.junit.jupiter.api.*;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static dev.bidarena.Sql.*;

/** Real MySQL, random disposable schema; never connects to the application schema. */
class BoundaryIT {
    static Database db;static AuctionService service;static String schema,url,user,password;long admin,a,b;
    @BeforeAll static void setup()throws Exception {
        url=Objects.requireNonNull(System.getenv("TEST_DB_URL"));user=System.getenv("TEST_DB_USER");password=System.getenv("TEST_DB_PASSWORD");
        schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        String base=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1),query=url.contains("?")?url.substring(url.indexOf('?')):"";
        db=new Database(new AppConfig(base+schema+query,user,password,"development",true));db.migrations().migrate();new DemoSeeder().initialize(db);service=new AuctionService(db);
    }
    @AfterAll static void cleanup()throws Exception {if(db!=null)db.close();if(schema!=null&&schema.matches("bid_arena_it_[a-f0-9]{32}"))try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}}
    @BeforeEach void identities()throws Exception {admin=n("SELECT id FROM users WHERE email='admin@example.com'");a=identity();b=identity();}
    long identity()throws Exception {return db.transaction(c->{long id;try(var p=prepare(c,"INSERT INTO users(email,password_hash,role,kind) SELECT ?,password_hash,'BIDDER','HUMAN' FROM users WHERE email='admin@example.com'",UUID.randomUUID()+"@example.test")){p.executeUpdate();try(var r=p.getGeneratedKeys()){r.next();id=r.getLong(1);}}update(c,"INSERT INTO wallets(user_id,total_balance) VALUES(?,1000)",id);update(c,"INSERT INTO wallet_transactions(user_id,effect_key,type,delta_total,delta_frozen,total_after,frozen_after) VALUES(?,?,'INITIAL_CREDIT',1000,0,1000,0)",id,"initial/"+id);return id;});}
    long n(String sql,Object...args)throws Exception {try(var c=db.connection()){return ((Number)one(c,sql,args).values().iterator().next()).longValue();}}
    void sql(String sql,Object...args)throws Exception{try(var c=db.connection()){update(c,sql,args);}}
    long auction()throws Exception{long id=service.create(admin,"boundary "+UUID.randomUUID(),180);service.join(id,a);service.join(id,b);return id;}
    String key(){return UUID.randomUUID().toString();}
    void checkMoney()throws Exception {assertEquals(0,n("SELECT COUNT(*) FROM wallets w WHERE total_balance<0 OR frozen_balance<0 OR frozen_balance>total_balance OR total_balance<>(SELECT SUM(delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT SUM(delta_frozen) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT COALESCE(SUM(amount),0) FROM auction_holds h WHERE h.user_id=w.user_id)"));assertEquals(0,n("SELECT COUNT(*) FROM (SELECT auction_id FROM wallet_transactions WHERE type='CAPTURE' GROUP BY auction_id HAVING COUNT(*)>1) d"));}
    @AfterEach void reconciles()throws Exception{checkMoney();}
    @Test void cancelledAndRepeatedTransitionsHaveNoExtraEffects()throws Exception {
        long id=auction();service.cancel(id);assertThrows(Fault.class,()->service.start(id));assertThrows(Fault.class,()->service.cancel(id));assertEquals("INVALID_STATE",service.bid(id,a,key(),110).get("error"));service.settle(id);assertEquals(1,n("SELECT COUNT(*) FROM auction_results WHERE auction_id=?",id));assertEquals(0,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));
        long x=auction();service.start(x);assertThrows(Fault.class,()->service.start(x));service.cancel(x);
    }
    @Test void exactFundsOneShortDifferentialAndInvalidMagnitude()throws Exception {
        long x=auction(),y=auction();service.start(x);service.start(y);assertEquals(100,n("SELECT current_price FROM auctions WHERE id=?",x));
        assertEquals("BID_TOO_LOW",service.bid(x,a,key(),109).get("error"));assertEquals("BID_ACCEPTED",service.bid(x,a,key(),110).get("type"));
        assertEquals("BID_ACCEPTED",service.bid(x,a,key(),120).get("type"));assertEquals(10,n("SELECT delta_frozen FROM wallet_transactions WHERE auction_id=? ORDER BY id DESC LIMIT 1",x));
        assertEquals("INSUFFICIENT_FUNDS",service.bid(y,a,key(),881).get("error"));assertEquals("BID_ACCEPTED",service.bid(y,a,key(),880).get("type"));assertEquals(1000,n("SELECT frozen_balance FROM wallets WHERE user_id=?",a));
        for(long amount:new long[]{-1,0,9_000_000_000_001L,Long.MAX_VALUE})assertThrows(Fault.class,()->service.bid(x,a,key(),amount));
        assertEquals("INSUFFICIENT_FUNDS",service.bid(x,b,key(),9_000_000_000_000L).get("error"));assertEquals(0,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND user_id=?",x,b));service.cancel(x);service.cancel(y);
        long z=auction();service.start(z);assertEquals("BID_ACCEPTED",service.bid(z,a,key(),1000).get("type"));service.cancel(z);
    }
    @Test void receiptMicrosecondBeforeEqualAndAfterDeadline()throws Exception {
        for(int offset:new int[]{-1,0,1}){long id=auction();service.start(id);String request=key();sql("UPDATE auctions SET end_at='2020-01-01 00:00:00.000001',extension_count=3 WHERE id=?",id);
            sql("INSERT INTO bid_requests(user_id,request_id,auction_id,payload_hash,received_at,amount) VALUES(?,?,?,?,?,110)",a,request,id,Api.digest(id+":110"),Timestamp.from(Instant.parse("2020-01-01T00:00:00.000001Z").plusNanos(offset*1000L)));
            service.settle(id);assertEquals(offset<0?1:0,n("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));assertEquals(offset<0?110:0,n("SELECT price FROM auction_results WHERE auction_id=?",id));
            System.out.println("BOUNDARY receiptOffsetMicroseconds="+offset+" requestId="+request+" auctionId="+id+" bids="+n("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));}
    }
    @Test void intakeLockDelaysEligibilityUntilAfterDeadline()throws Exception {
        long id=auction();service.start(id);String request=key();var pool=Executors.newSingleThreadExecutor();
        try(var c=db.connection()){c.setAutoCommit(false);one(c,"SELECT auction_id FROM auction_intake WHERE auction_id=? FOR UPDATE",id);var future=pool.submit(()->service.bid(id,a,request,110));
            sql("UPDATE auctions SET end_at='2020-01-01 00:00:00',extension_count=3 WHERE id=?",id);c.commit();assertEquals("AUCTION_ENDED",future.get(15,TimeUnit.SECONDS).get("error"));
        }finally{pool.shutdownNow();}service.settle(id);assertEquals(0,n("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));
    }
    @Test void thirdExtensionRaceAndRollbackAreAtomic()throws Exception {
        long id=auction();service.start(id);sql("UPDATE auctions SET end_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 4 SECOND),extension_count=2 WHERE id=?",id);String before=(String)service.snapshot(id).get("end_at");
        var failing=new AuctionService(db,p->{if(p.equals("bid.afterMoney"))throw new SQLException("extension rollback test");});String request=key();assertThrows(SQLException.class,()->failing.bid(id,a,request,110));assertEquals(before,service.snapshot(id).get("end_at"));assertEquals(100,n("SELECT current_price FROM auctions WHERE id=?",id));assertEquals(0,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));
        var pool=Executors.newFixedThreadPool(2);try{var x=pool.submit(()->service.bid(id,a,request,110));var y=pool.submit(()->service.bid(id,b,key(),120));x.get(15,TimeUnit.SECONDS);y.get(15,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
        assertEquals(3,n("SELECT extension_count FROM auctions WHERE id=?",id));assertEquals(Instant.parse(before).plusSeconds(10).toString(),service.snapshot(id).get("end_at"));assertEquals("BID_ACCEPTED",service.bid(id,a,key(),130).get("type"));service.cancel(id);
    }
    @Test void cancellationCompetesWithExpiredSettlement()throws Exception {
        long id=auction();service.start(id);service.bid(id,a,key(),110);sql("UPDATE auctions SET end_at='2020-01-01' WHERE id=?",id);var pool=Executors.newFixedThreadPool(3);
        try{var cancel=pool.submit(()->{try{service.cancel(id);}catch(Fault e){assertEquals("INVALID_STATE",e.code);}return null;});var settle=pool.submit(()->{service.settle(id);return null;});var bid=pool.submit(()->service.bid(id,b,key(),120));cancel.get(15,TimeUnit.SECONDS);settle.get(15,TimeUnit.SECONDS);assertEquals("BID_REJECTED",bid.get(15,TimeUnit.SECONDS).get("type"));}finally{pool.shutdownNow();}
        assertEquals(1,n("SELECT COUNT(*) FROM auction_results WHERE auction_id=?",id));assertEquals(0,n("SELECT SUM(amount) FROM auction_holds WHERE auction_id=?",id));assertTrue(Set.of("FINISHED","CANCELLED").contains(service.snapshot(id).get("status")));
    }
    @Test void moreThanOneScannerBatchAndConcurrentExecutors()throws Exception {
        List<Long> ids=new ArrayList<>();for(int i=0;i<105;i++){long id=service.create(admin,"batch "+i,180);service.start(id);ids.add(id);}sql("UPDATE auctions SET end_at='2020-01-01' WHERE status='RUNNING'");
        var pool=Executors.newFixedThreadPool(3);try{var jobs=new ArrayList<Future<?>>();for(int i=0;i<3;i++)jobs.add(pool.submit(()->{try{new AuctionService(db).tick();new AuctionService(db).tick();}catch(Exception e){throw new RuntimeException(e);}}));for(var f:jobs)f.get(40,TimeUnit.SECONDS);}finally{pool.shutdownNow();}
        for(long id:ids){assertEquals("FINISHED",service.snapshot(id).get("status"));assertEquals(1,n("SELECT COUNT(*) FROM auction_results WHERE auction_id=?",id));assertEquals(0,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));}System.out.println("BOUNDARY scanned=105 executors=3 uniqueEmptyResults=105");
    }
    @Test void realDeadlockCycleHasMysqlVictimThenOrderedLocksSucceed()throws Exception {
        var barrier=new CyclicBarrier(2);var pool=Executors.newFixedThreadPool(2);
        try{var x=pool.submit(()->cycle(a,b,barrier));var y=pool.submit(()->cycle(b,a,barrier));var codes=List.of(x.get(15,TimeUnit.SECONDS),y.get(15,TimeUnit.SECONDS));assertEquals(1,codes.stream().filter(code->code==1213).count());assertEquals(1,codes.stream().filter(code->code==0).count());System.out.println("REAL_MYSQL_DEADLOCK outcomes="+codes+" rows="+a+","+b);
            var jobs=new ArrayList<Future<?>>();for(int i=0;i<2;i++)jobs.add(pool.submit(()->{try{db.transaction(c->{one(c,"SELECT user_id FROM wallets WHERE user_id=? FOR UPDATE",Math.min(a,b));one(c,"SELECT user_id FROM wallets WHERE user_id=? FOR UPDATE",Math.max(a,b));return null;});}catch(Exception e){throw new RuntimeException(e);}}));for(var f:jobs)f.get(15,TimeUnit.SECONDS);
        }finally{pool.shutdownNow();}
    }
    @Test void exhaustedInjectedRetriesLeaveRecoverableReceiptWithoutMoney()throws Exception {
        long id=auction();service.start(id);String request=key();var attempts=new java.util.concurrent.atomic.AtomicInteger();
        var failing=new AuctionService(db,p->{if(p.equals("bid.afterMoney")){attempts.incrementAndGet();throw new SQLException("injected retry exhaustion","40001",1213);}});
        assertEquals(1213,assertThrows(SQLException.class,()->failing.bid(id,a,request,110)).getErrorCode());assertEquals(3,attempts.get());
        assertEquals(0,n("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));assertEquals(0,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));assertEquals(1,n("SELECT COUNT(*) FROM bid_requests WHERE auction_id=? AND state='PENDING'",id));
        assertEquals("BID_ACCEPTED",service.bid(id,a,request,110).get("type"));assertEquals(true,service.bid(id,a,request,110).get("replayed"));assertEquals(1,n("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));service.cancel(id);
    }
    int cycle(long first,long second,CyclicBarrier barrier)throws Exception {try(var c=db.connection()){c.setAutoCommit(false);try{one(c,"SELECT user_id FROM wallets WHERE user_id=? FOR UPDATE",first);barrier.await(5,TimeUnit.SECONDS);one(c,"SELECT user_id FROM wallets WHERE user_id=? FOR UPDATE",second);c.rollback();return 0;}catch(SQLException e){c.rollback();if(e.getErrorCode()!=1213)throw e;return e.getErrorCode();}}}

    @Test void realApplicationVictimRetriesFreshTransactionAndExhaustionRecovers()throws Exception {
        sql("CREATE TABLE deadlock_probe(id INT PRIMARY KEY,value INT NOT NULL) ENGINE=InnoDB");
        for(int i=1;i<=201;i++)sql("INSERT INTO deadlock_probe VALUES(?,0)",i);
        try{
            for(int cycles:new int[]{1,3}){
                long id=auction();service.start(id);service.bid(id,b,key(),110);String request=key();var attempts=new java.util.concurrent.atomic.AtomicInteger();
                var contexts=new ArrayList<Connection>();var pool=Executors.newSingleThreadExecutor();
                long retries=db.metrics.count("bid.retries"),deadlocks=db.metrics.count("sql.deadlocks");
                var contender=new AuctionService(db,new AuctionService.FaultInjector(){
                    public void at(String point){}
                    public void at(String point,Connection app)throws SQLException {
                        if(!point.equals("bid.afterMoney"))return;
                        assertFalse(app.getAutoCommit());assertTrue(contexts.stream().allMatch(previous->previous!=app),"each retry must open a fresh logical transaction");contexts.add(app);
                        int attempt=attempts.incrementAndGet();
                        // Previous victim's writes must have rolled back, not accumulated.
                        assertEquals(120,number(one(app,"SELECT frozen_balance FROM wallets WHERE user_id=?",a),"frozen_balance"));
                        assertEquals(0,number(one(app,"SELECT frozen_balance FROM wallets WHERE user_id=?",b),"frozen_balance"));
                        assertEquals(2,number(one(app,"SELECT COUNT(*) n FROM wallet_transactions WHERE auction_id=? AND type='FREEZE'",id),"n"));
                        assertEquals(1,number(one(app,"SELECT COUNT(*) n FROM wallet_transactions WHERE auction_id=? AND type='RELEASE'",id),"n"));
                        if(attempt>cycles)return;
                        var held=new CountDownLatch(1);var proceed=new CountDownLatch(1);
                        var blocker=pool.submit(()->{try(var other=db.connection()){
                            other.setAutoCommit(false);
                            try{one(other,"SELECT id FROM deadlock_probe WHERE id=1 FOR UPDATE");
                                update(other,"UPDATE deadlock_probe SET value=value+1 WHERE id>1");held.countDown();
                                if(!proceed.await(10,TimeUnit.SECONDS))throw new IllegalStateException("application did not enter cycle");
                                one(other,"SELECT id FROM auctions WHERE id=? FOR UPDATE",id);other.commit();
                            }catch(Exception e){other.rollback();throw e;}
                        }return null;});
                        try{
                            assertTrue(held.await(10,TimeUnit.SECONDS));proceed.countDown();
                            SQLException victim=assertThrows(SQLException.class,()->one(app,"SELECT id FROM deadlock_probe WHERE id=1 FOR UPDATE"));
                            assertEquals(1213,victim.getErrorCode(),"must be actual MySQL application victim");assertEquals("40001",victim.getSQLState());
                            blocker.get(10,TimeUnit.SECONDS);
                            System.out.println("REAL_APP_DEADLOCK auction="+id+" attempt="+attempt+" mysqlCode="+victim.getErrorCode()+" sqlState="+victim.getSQLState());
                            throw victim; // Propagate the real driver exception into the production retry loop.
                        }catch(InterruptedException e){Thread.currentThread().interrupt();throw new SQLException("interrupted",e);}
                        catch(ExecutionException|TimeoutException e){throw new SQLException("deadlock orchestration failed",e);}
                    }
                });
                try{
                    if(cycles==1){assertEquals("BID_ACCEPTED",contender.bid(id,a,request,120).get("type"));assertEquals(2,attempts.get());assertEquals(1,db.metrics.count("bid.retries")-retries);}
                    else {assertEquals(1213,assertThrows(SQLException.class,()->contender.bid(id,a,request,120)).getErrorCode());assertEquals(3,attempts.get());assertEquals(2,db.metrics.count("bid.retries")-retries);
                        assertEquals(1,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));assertEquals(1,n("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));assertEquals(110,n("SELECT current_price FROM auctions WHERE id=?",id));
                        assertEquals(110,n("SELECT frozen_balance FROM wallets WHERE user_id=?",b));assertEquals(0,n("SELECT frozen_balance FROM wallets WHERE user_id=?",a));
                        assertEquals(1,n("SELECT COUNT(*) FROM bid_requests WHERE auction_id=? AND state='PENDING'",id));
                        service.tick(); // Actual scanner recovers the durable PENDING receipt without client help.
                    }
                    assertEquals(cycles,db.metrics.count("sql.deadlocks")-deadlocks);assertTrue(contexts.stream().allMatch(c->{try{return c.isClosed();}catch(SQLException e){return false;}}));
                    assertEquals(true,service.bid(id,a,request,120).get("replayed"));assertEquals(2,n("SELECT COUNT(*) FROM bids WHERE auction_id=?",id));assertEquals(2,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='FREEZE'",id));assertEquals(1,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='RELEASE'",id));
                    assertEquals(a,n("SELECT leader_id FROM auctions WHERE id=?",id));assertEquals(120,n("SELECT amount FROM auction_holds WHERE auction_id=? AND user_id=?",id,a));
                    sql("UPDATE auctions SET end_at='2020-01-01' WHERE id=?",id);service.tick();service.settle(id);assertEquals(1,n("SELECT COUNT(*) FROM auction_results WHERE auction_id=?",id));assertEquals(120,n("SELECT price FROM auction_results WHERE auction_id=?",id));assertEquals(a,n("SELECT winner_id FROM auction_results WHERE auction_id=?",id));assertEquals(880,n("SELECT total_balance FROM wallets WHERE user_id=?",a));assertEquals(1000,n("SELECT total_balance FROM wallets WHERE user_id=?",b));assertEquals(1,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=? AND type='CAPTURE'",id));assertEquals(0,n("SELECT COUNT(*) FROM bid_requests WHERE auction_id=? AND state='PENDING'",id));checkMoney();
                    System.out.println("REAL_APP_RECOVERY cycles="+cycles+" attempts="+attempts+" bids=2 freeze=2 release=1 capture=1 pending=0");
                    // Use a fresh funded identity in the next scenario.
                    a=identity();b=identity();
                }finally{pool.shutdownNow();}
            }
        }finally{sql("DROP TABLE deadlock_probe");}
    }

    @Test void unrecoverableSqlAndBusinessRejectionsAreNotRetried()throws Exception {
        for(int code:new int[]{1062,1146}){
            long id=auction();service.start(id);var attempts=new java.util.concurrent.atomic.AtomicInteger();long before=db.metrics.count("bid.retries");
            var failing=new AuctionService(db,p->{if(p.equals("bid.afterMoney")){attempts.incrementAndGet();throw new SQLException("explicit nonrecoverable test","HY000",code);}});
            assertEquals(code,assertThrows(SQLException.class,()->failing.bid(id,a,key(),110)).getErrorCode());assertEquals(1,attempts.get());assertEquals(before,db.metrics.count("bid.retries"));assertEquals(0,n("SELECT COUNT(*) FROM wallet_transactions WHERE auction_id=?",id));service.cancel(id);
        }
        long id=auction();service.start(id);long before=db.metrics.count("bid.retries");assertEquals("BID_TOO_LOW",service.bid(id,a,key(),100).get("error"));assertThrows(Fault.class,()->service.bid(id,a,"invalid request",110));assertEquals(before,db.metrics.count("bid.retries"));service.cancel(id);
    }
}
