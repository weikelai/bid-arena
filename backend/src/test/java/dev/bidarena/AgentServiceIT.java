package dev.bidarena;

import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;
import static dev.bidarena.Sql.*;

class AgentServiceIT {
 @Test void independentWorkersUseRealMysqlAndRestrictedHttp()throws Exception {
  String url=Objects.requireNonNull(System.getenv("TEST_DB_URL")),user=System.getenv("TEST_DB_USER"),password=System.getenv("TEST_DB_PASSWORD");
  String schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
  String base=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1),query=url.contains("?")?url.substring(url.indexOf('?')):"";
  try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
  try{
   ProcessBuilder test=new ProcessBuilder("node","../scripts/agent-service-check.mjs");
   test.environment().putAll(Map.of("DB_URL",base+schema+query,"DB_USER",user,"DB_PASSWORD",password,"APP_ENV","development","SEED_DEMO","true","JAVA_BINARY",java.nio.file.Path.of(System.getProperty("java.home"),"bin","java").toString()));
   Process p=test.redirectErrorStream(true).redirectOutput(new java.io.File("target/agent-service-check.log")).start();
   try{assertTrue(p.waitFor(420,TimeUnit.SECONDS),"Agent test deadline; target/agent-service-check.log");assertEquals(0,p.exitValue(),"Inspect target/agent-service-check.log");}finally{if(p.isAlive())p.destroyForcibly();}
   try(var c=DriverManager.getConnection(base+schema+query,user,password)){
    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM wallets w WHERE total_balance<>(SELECT SUM(delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT SUM(delta_frozen) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT COALESCE(SUM(amount),0) FROM auction_holds h WHERE h.user_id=w.user_id) OR total_balance<frozen_balance OR frozen_balance<0"),"n"));
    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM (SELECT user_id,request_id,COUNT(*) n FROM bids GROUP BY user_id,request_id HAVING n>1) d"),"n"));
    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM agent_jobs WHERE pending_id IS NOT NULL"),"n"));
    assertTrue(number(one(c,"SELECT COUNT(*) n FROM bids b JOIN users u ON u.id=b.user_id WHERE u.kind='AGENT'"),"n")>=5);
    assertTrue(number(one(c,"SELECT COUNT(*) n FROM auction_results WHERE reason='SOLD'"),"n")>=1);
    System.out.println("AGENT_SQL_RECONCILIATION PASS: balances, holds, ledger, unique requests, no pending, sold result");
   }
  }finally{try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}}
 }
}
