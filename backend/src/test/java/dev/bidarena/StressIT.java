package dev.bidarena;
import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
import static dev.bidarena.Sql.*;

class StressIT {
    @Test void graduatedHttpLoadAndSqlReconciliation()throws Exception {
        String url=Objects.requireNonNull(System.getenv("TEST_DB_URL")),user=System.getenv("TEST_DB_USER"),password=System.getenv("TEST_DB_PASSWORD"),schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        String base=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1),query=url.contains("?")?url.substring(url.indexOf('?')):"";Process backend=null;
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        try{
            int port;try(var socket=new java.net.ServerSocket(0)){port=socket.getLocalPort();}
            var boot=new ProcessBuilder(java.nio.file.Path.of(System.getProperty("java.home"),"bin","java").toString(),"-jar","target/bid-arena.jar");boot.environment().putAll(Map.of("DB_URL",base+schema+query,"DB_USER",user,"DB_PASSWORD",password,"APP_ENV","development","SEED_DEMO","true","BACKEND_PORT",""+port));backend=boot.redirectErrorStream(true).redirectOutput(new java.io.File("target/stress-backend.log")).start();
            var client=java.net.http.HttpClient.newHttpClient();boolean ready=false;for(int i=0;i<150&&backend.isAlive();i++){try{if(client.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:"+port+"/api/v1/health")).timeout(java.time.Duration.ofSeconds(2)).build(),java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode()==200){ready=true;break;}}catch(Exception ignored){}Thread.sleep(100);}assertTrue(ready);
            for(int population:new int[]{20,50,100,200}){
                long started=System.nanoTime(),cpuBefore=backend.info().totalCpuDuration().orElse(java.time.Duration.ZERO).toMillis();
                var script=new ProcessBuilder("node","../scripts/stress-auction.mjs","--users="+population);script.environment().putAll(Map.of("API_BASE_URL","http://127.0.0.1:"+port+"/api/v1","SIMULATION_ALLOW_MUTATION","isolated","STRESS_JAVA_PID",""+backend.pid()));Process child=script.redirectErrorStream(true).redirectOutput(new java.io.File("target/stress-"+population+".log")).start();
                try{assertTrue(child.waitFor(240,TimeUnit.SECONDS),"Load timeout; do not increase population");assertEquals(0,child.exitValue(),"Stop load progression; inspect stress-"+population+".log");}finally{if(child.isAlive())child.destroyForcibly();}
                try(var c=DriverManager.getConnection(base+schema+query,user,password)){
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM wallets w WHERE total_balance<0 OR frozen_balance<0 OR frozen_balance>total_balance OR total_balance<>(SELECT SUM(delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT SUM(delta_frozen) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT COALESCE(SUM(amount),0) FROM auction_holds h WHERE h.user_id=w.user_id)"),"n"));
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM (SELECT auction_id FROM wallet_transactions WHERE type='CAPTURE' GROUP BY auction_id HAVING COUNT(*)>1) x"),"n"));
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM bid_requests WHERE state='PENDING'"),"n"));
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM bids b LEFT JOIN wallet_transactions t ON t.user_id=b.user_id AND t.auction_id=b.auction_id AND t.request_id=b.request_id AND t.type='FREEZE' WHERE t.id IS NULL"),"n"));
                    System.out.println("STRESS_SQL users="+population+" inconsistent=0 pending=0 orphanBid=0 duplicateCapture=0");
                }
                System.out.println("STRESS_PROCESS users="+population+" elapsedMs="+(System.nanoTime()-started)/1_000_000+" javaCpuMs="+(backend.info().totalCpuDuration().orElse(java.time.Duration.ZERO).toMillis()-cpuBefore));
            }
        }finally{if(backend!=null){backend.destroy();if(!backend.waitFor(10,TimeUnit.SECONDS))backend.destroyForcibly();}try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}}
    }
}
