package dev.bidarena;

import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import java.nio.file.*;
import java.util.concurrent.TimeUnit;
import static dev.bidarena.Sql.*;
import static org.junit.jupiter.api.Assertions.*;

class BackupIT {
    int run(String mode,String file,String schema,String key,boolean readonly)throws Exception{
        var p=new ProcessBuilder("node","scripts/encrypted-backup.mjs",mode,file).directory(new java.io.File(".."));
        p.environment().putAll(Map.of("BACKUP_SCHEMA",schema,"BACKUP_KEY",key,"BACKUP_DB_USER",System.getenv(readonly?"TEST_BACKUP_USER":"TEST_DB_USER"),"BACKUP_DB_PASSWORD",System.getenv(readonly?"TEST_BACKUP_PASSWORD":"TEST_DB_PASSWORD")));
        var child=p.redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.appendTo(new java.io.File("target/backup-restore.log"))).start();assertTrue(child.waitFor(60,TimeUnit.SECONDS));return child.exitValue();
    }
    @Test void encryptedSeparateIdentityRestoreAndReconcile()throws Exception{
        String url=Objects.requireNonNull(System.getenv("TEST_DB_URL")),user=System.getenv("TEST_DB_USER"),password=System.getenv("TEST_DB_PASSWORD"),schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-",""),target="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        String base=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1),query=url.contains("?")?url.substring(url.indexOf('?')):"",file=".local/backup-"+UUID.randomUUID()+".bak";
        byte[] key=new byte[32];new java.security.SecureRandom().nextBytes(key);String hex=HexFormat.of().formatHex(key);
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        try{
            try(var db=new Database(new AppConfig(base+schema+query,user,password,"development",true))){db.migrations().migrate();new DemoSeeder().initialize(db);var s=new AuctionService(db);long a,b;try(var c=db.connection()){a=number(one(c,"SELECT id FROM users WHERE role='ADMIN'"),"id");b=number(one(c,"SELECT id FROM users WHERE email='bidder_a@example.com'"),"id");}long id=s.create(a,"backup test",180);s.join(id,b);s.start(id);s.bid(id,b,UUID.randomUUID().toString(),110);try(var c=db.connection()){update(c,"UPDATE auctions SET end_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?",id);}s.settle(id);}
            assertEquals(0,run("backup",file,schema,hex,true));assertNotEquals(0,run("backup",file,schema,hex,true));
            assertNotEquals(0,run("restore",file,target,"00".repeat(32),false));
            assertEquals(0,run("restore",file,target,hex,false));assertNotEquals(0,run("restore",file,target,hex,false));
            try(var db=new Database(new AppConfig(base+target+query,user,password,"development",false))){db.migrations().validate();try(var c=db.connection()){
                assertEquals(3,number(one(c,"SELECT COUNT(*) n FROM users"),"n"));assertEquals(3,number(one(c,"SELECT COUNT(*) n FROM wallets"),"n"));assertEquals(1,number(one(c,"SELECT COUNT(*) n FROM auction_results WHERE reason='SOLD' AND price=110"),"n"));
                assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM wallets w WHERE total_balance<>(SELECT SUM(delta_total) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT SUM(delta_frozen) FROM wallet_transactions t WHERE t.user_id=w.user_id) OR frozen_balance<>(SELECT COALESCE(SUM(amount),0) FROM auction_holds h WHERE h.user_id=w.user_id)"),"n"));
                assertEquals(1,number(one(c,"SELECT COUNT(*) n FROM wallet_transactions WHERE type='CAPTURE' AND delta_total=-110"),"n"));
            }}
        }finally{try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE IF EXISTS `"+schema+"`");update(c,"DROP DATABASE IF EXISTS `"+target+"`");}}
    }
}
