package dev.bidarena;

import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static dev.bidarena.Sql.*;
import static org.junit.jupiter.api.Assertions.*;

/** Bounded shared-host soak, not a 10/30/60 minute capacity certification. */
class StabilityIT {
    private static final String RECONCILE="SELECT COUNT(*) n FROM wallets w WHERE total_balance<0 OR frozen_balance<0 OR frozen_balance>total_balance OR total_balance<>(SELECT SUM(delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT SUM(delta_frozen) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT COALESCE(SUM(amount),0) FROM auction_holds h WHERE h.user_id=w.user_id)";
    @Test void boundedMultiRoomLoadWithLiveSqlStopConditions()throws Exception {
        String url=Objects.requireNonNull(System.getenv("TEST_DB_URL")),user=System.getenv("TEST_DB_USER"),password=System.getenv("TEST_DB_PASSWORD"),schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        String base=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1),query=url.contains("?")?url.substring(url.indexOf('?')):"",jdbc=base+schema+query;Process backend=null;
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        try{
            int port;try(var socket=new java.net.ServerSocket(0)){port=socket.getLocalPort();}
            var boot=new ProcessBuilder(java.nio.file.Path.of(System.getProperty("java.home"),"bin","java").toString(),"-jar","target/bid-arena.jar");boot.environment().putAll(Map.of("DB_URL",jdbc,"DB_USER",user,"DB_PASSWORD",password,"APP_ENV","development","SEED_DEMO","true","BACKEND_PORT",""+port));backend=boot.redirectErrorStream(true).redirectOutput(new java.io.File("target/stability-backend.log")).start();
            var client=java.net.http.HttpClient.newHttpClient();boolean ready=false;for(int i=0;i<150&&backend.isAlive();i++){try{if(client.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:"+port+"/api/v1/health")).timeout(java.time.Duration.ofSeconds(2)).build(),java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode()==200){ready=true;break;}}catch(Exception ignored){}Thread.sleep(100);}assertTrue(ready);
            for(int[] grade:new int[][]{{20,120},{50,300}}){
                var global=new ArrayList<Object>();
                try(var c=DriverManager.getConnection(jdbc,user,password)){global.add(rows(c,"SHOW GLOBAL STATUS WHERE Variable_name IN ('Innodb_row_lock_current_waits','Innodb_row_lock_time','Innodb_row_lock_waits','Innodb_deadlocks')"));}
                var script=new ProcessBuilder("node","../scripts/stability-auction.mjs","--users="+grade[0],"--seconds="+grade[1]);script.environment().putAll(Map.of("API_BASE_URL","http://127.0.0.1:"+port+"/api/v1","SIMULATION_ALLOW_MUTATION","isolated","STRESS_JAVA_PID",""+backend.pid()));Process child=script.redirectErrorStream(true).redirectOutput(new java.io.File("target/stability-"+grade[0]+".log")).start();
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(grade[1]+180);int checks=0;
                try{
                    while(!child.waitFor(5,TimeUnit.SECONDS)){assertTrue(System.nanoTime()<deadline,"stop: load deadline exceeded");assertTrue(backend.isAlive(),"stop: backend died");try(var c=DriverManager.getConnection(jdbc,user,password)){assertEquals(0,number(one(c,RECONCILE),"n"),"stop: live money discrepancy");assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM (SELECT auction_id FROM wallet_transactions WHERE type='CAPTURE' GROUP BY auction_id HAVING COUNT(*)>1) d"),"n"),"stop: duplicate capture");checks++;}}
                    assertEquals(0,child.exitValue(),"stop progression: inspect stability log");
                }finally{if(child.isAlive())child.destroyForcibly();}
                try(var c=DriverManager.getConnection(jdbc,user,password)){
                    assertEquals(0,number(one(c,RECONCILE),"n"));assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM bid_requests WHERE state='PENDING'"),"n"));
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM auctions WHERE status='RUNNING'"),"n"));
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM auctions a WHERE status='FINISHED' AND (SELECT COUNT(*) FROM auction_results r WHERE r.auction_id=a.id)<>1"),"n"));
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM auction_results r WHERE (reason='SOLD' AND (SELECT COUNT(*) FROM wallet_transactions t WHERE t.auction_id=r.auction_id AND t.type='CAPTURE')<>1) OR (reason='NO_BIDS' AND EXISTS(SELECT 1 FROM wallet_transactions t WHERE t.auction_id=r.auction_id AND t.type='CAPTURE'))"),"n"));
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM auction_results r JOIN wallet_transactions t ON t.auction_id=r.auction_id AND t.type='CAPTURE' WHERE t.user_id<>r.winner_id OR t.delta_total<>-r.price OR t.delta_frozen<>-r.price"),"n"));
                    global.add(rows(c,"SHOW GLOBAL STATUS WHERE Variable_name IN ('Innodb_row_lock_current_waits','Innodb_row_lock_time','Innodb_row_lock_waits','Innodb_deadlocks')"));
                }
                java.nio.file.Files.writeString(java.nio.file.Path.of("target/stability-"+grade[0]+"-mysql.json"),json(global));
                System.out.println("STABILITY_SQL users="+grade[0]+" requestedSeconds="+grade[1]+" liveChecks="+checks+" inconsistent=0 pending=0 duplicateCapture=0 uniqueResults=true");
            }
        }finally{if(backend!=null){backend.destroy();if(!backend.waitFor(10,TimeUnit.SECONDS))backend.destroyForcibly();}try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}}
    }
}
