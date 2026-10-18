package dev.bidarena;

import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import static dev.bidarena.Sql.*;
import static org.junit.jupiter.api.Assertions.*;

class RuntimePermissionsIT {
    @Test void dmlOnlyAccountRunsMoneyLifecycleButCannotPerformDdl()throws Exception {
        String url=Objects.requireNonNull(System.getenv("TEST_DB_URL")),user=System.getenv("TEST_DB_USER"),password=System.getenv("TEST_DB_PASSWORD"),schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        String jdbc=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1)+schema+(url.contains("?")?url.substring(url.indexOf('?')):"");
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        try {
            try(var migration=new Database(new AppConfig(jdbc,user,password,"development",true))){migration.migrations().migrate();new DemoSeeder().initialize(migration);}
            try(var runtime=new Database(new AppConfig(jdbc,Objects.requireNonNull(System.getenv("TEST_RUNTIME_USER")),Objects.requireNonNull(System.getenv("TEST_RUNTIME_PASSWORD")),"production",false))){
                runtime.migrations().validate();
                long admin,a,b;
                try(var c=runtime.connection()){
                    admin=number(one(c,"SELECT id FROM users WHERE role='ADMIN'"),"id");a=number(one(c,"SELECT id FROM users WHERE email='bidder_a@example.com'"),"id");b=number(one(c,"SELECT id FROM users WHERE email='bidder_b@example.com'"),"id");
                    assertThrows(SQLException.class,()->update(c,"CREATE TABLE forbidden(id BIGINT)"));
                    assertThrows(SQLException.class,()->update(c,"ALTER TABLE wallets ADD forbidden INT"));
                    assertThrows(SQLException.class,()->rows(c,"SELECT * FROM mysql.user"));
                    assertThrows(SQLException.class,()->update(c,"CREATE DATABASE runtime_forbidden"));
                }
                assertNotNull(new SecurityService(runtime,true).login("bidder_a@example.com","Test123456!","runtime-test"));
                var service=new AuctionService(runtime);long id=service.create(admin,"runtime permissions",180);service.join(id,a);service.join(id,b);service.start(id);
                String request=UUID.randomUUID().toString();assertEquals("BID_ACCEPTED",service.bid(id,a,request,110).get("type"));assertEquals(true,service.bid(id,a,request,110).get("replayed"));service.bid(id,b,UUID.randomUUID().toString(),120);
                try(var c=runtime.connection()){update(c,"UPDATE auctions SET end_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?",id);}
                service.settle(id);assertEquals("FINISHED",service.snapshot(id).get("status"));assertNotNull(new Api(runtime).walletSnapshot(b));
                try(var c=runtime.connection()){
                    assertEquals(0,number(one(c,"SELECT SUM(frozen_balance) n FROM wallets"),"n"));
                    assertEquals(1,number(one(c,"SELECT COUNT(*) n FROM wallet_transactions WHERE type='CAPTURE'"),"n"));
                    assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM wallets w WHERE total_balance<>(SELECT SUM(delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id)"),"n"));
                    assertFalse(rows(c,"SELECT * FROM auction_events WHERE auction_id=?",id).isEmpty());
                }
            }
        } finally {try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}}
    }
}
