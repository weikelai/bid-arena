package dev.bidarena;

import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
import static dev.bidarena.Sql.*;

class HttpSimulationIT {
    @Test void realHttpAgentAndTwentyUserSimulation()throws Exception {
        String url=Objects.requireNonNull(System.getenv("TEST_DB_URL")),user=System.getenv("TEST_DB_USER"),password=System.getenv("TEST_DB_PASSWORD");
        String schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        String base=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1),query=url.contains("?")?url.substring(url.indexOf('?')):"";
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        Process backend=null;
        try {
            int port;try(var socket=new java.net.ServerSocket(0)){port=socket.getLocalPort();}
            ProcessBuilder boot=new ProcessBuilder(java.nio.file.Path.of(System.getProperty("java.home"),"bin","java").toString(),"-jar","target/bid-arena.jar");
            boot.environment().putAll(Map.of("DB_URL",base+schema+query,"DB_USER",user,"DB_PASSWORD",password,"APP_ENV","development","SEED_DEMO","true","BACKEND_PORT",""+port));
            backend=boot.redirectErrorStream(true).redirectOutput(new java.io.File("target/http-simulation-backend.log")).start();
            boolean ready=false;var client=java.net.http.HttpClient.newHttpClient();
            for(int i=0;i<150&&backend.isAlive();i++) {try{if(client.send(java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:"+port+"/api/v1/health")).build(),java.net.http.HttpResponse.BodyHandlers.ofString()).statusCode()==200){ready=true;break;}}catch(Exception ignored){}Thread.sleep(100);}
            assertTrue(ready,"HTTP backend failed: target/http-simulation-backend.log");
            ProcessBuilder sim=new ProcessBuilder("node","../scripts/simulate-auction.mjs","--bots=20","--seed=42");
            sim.environment().putAll(Map.of("API_BASE_URL","http://127.0.0.1:"+port+"/api/v1","SIMULATION_ALLOW_MUTATION","isolated"));
            Process script=sim.redirectErrorStream(true).redirectOutput(new java.io.File("target/http-simulation.log")).start();
            try{assertTrue(script.waitFor(120,TimeUnit.SECONDS),"Simulation timed out");assertEquals(0,script.exitValue(),"Inspect target/http-simulation.log");}finally{if(script.isAlive())script.destroyForcibly();}
            ProcessBuilder browserCheck=new ProcessBuilder("node","browser-check.mjs").directory(new java.io.File("../frontend"));
            browserCheck.environment().putAll(Map.of("API_BASE_URL","http://127.0.0.1:"+port+"/api/v1","SIMULATION_ALLOW_MUTATION","isolated"));
            Process browser=browserCheck.redirectErrorStream(true).redirectOutput(new java.io.File("target/browser-acceptance.log")).start();
            try{assertTrue(browser.waitFor(120,TimeUnit.SECONDS),"Browser timed out");assertEquals(0,browser.exitValue(),"Inspect target/browser-acceptance.log");}finally{if(browser.isAlive())browser.destroyForcibly();}
            try(var c=DriverManager.getConnection(base+schema+query,user,password)) {
                assertEquals(0L,number(one(c,"SELECT COUNT(*) n FROM wallets w WHERE frozen_balance<>(SELECT COALESCE(SUM(amount),0) FROM auction_holds h WHERE h.user_id=w.user_id) OR total_balance<>(SELECT SUM(delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT SUM(delta_frozen) FROM wallet_transactions t WHERE t.user_id=w.user_id)"),"n"));
                var result=one(c,"SELECT r.*,w.total_balance,w.frozen_balance FROM auction_results r JOIN wallets w ON w.user_id=r.winner_id WHERE reason='SOLD'");
                assertEquals(1000-number(result,"price"),number(result,"total_balance"));assertEquals(0,number(result,"frozen_balance"));
                assertEquals(1L,number(one(c,"SELECT COUNT(*) n FROM wallet_transactions WHERE type='CAPTURE'"),"n"));
                assertEquals(0L,number(one(c,"SELECT COUNT(*) n FROM bids b JOIN bid_requests r ON r.user_id=b.user_id AND r.request_id=b.request_id WHERE b.auction_id<>r.auction_id"),"n"));
                assertEquals(0L,number(one(c,"SELECT COUNT(*) n FROM agent_tokens WHERE LENGTH(digest)<>32"),"n"));
            }
        } finally {
            if(backend!=null){backend.destroy();if(!backend.waitFor(10,TimeUnit.SECONDS))backend.destroyForcibly();}
            try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}
        }
    }
}
