package dev.bidarena;

import org.junit.jupiter.api.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import static dev.bidarena.Sql.*;
import static org.junit.jupiter.api.Assertions.*;

class SecurityIT {
    static Database db;static String schema,url,user,password,jdbc;
    @BeforeAll static void setup()throws Exception{
        url=Objects.requireNonNull(System.getenv("TEST_DB_URL"));user=System.getenv("TEST_DB_USER");password=System.getenv("TEST_DB_PASSWORD");schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        jdbc=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1)+schema+(url.contains("?")?url.substring(url.indexOf('?')):"");
        db=new Database(new AppConfig(jdbc,user,password,"development",false));db.migrations().migrate();
    }
    @AfterAll static void clean()throws Exception{if(db!=null)db.close();if(schema!=null)try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}}
    @Test void bootstrapExpiryWrongReplayAndRestart()throws Exception{
        var service=new SecurityService(db,true);String secret=service.prepareBootstrap();
        assertThrows(Fault.class,()->service.prepareBootstrap());
        assertThrows(Fault.class,()->service.consumeBootstrap("wrong", "owner@example.com", "Long-test-password-123!"));
        try(var c=db.connection()){update(c,"UPDATE security_bootstrap SET expires_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND)");}
        assertThrows(Fault.class,()->service.consumeBootstrap(secret,"owner@example.com","Long-test-password-123!"));
        String next=service.prepareBootstrap();
        var restored=new SecurityService(db,true);long id=restored.consumeBootstrap(next,"owner@example.com","Long-test-password-123!");assertTrue(id>0);
        assertThrows(Fault.class,()->restored.consumeBootstrap(next,"owner@example.com","Long-test-password-123!"));assertThrows(Fault.class,()->restored.prepareBootstrap());
        try(var c=db.connection()){assertNull(one(c,"SELECT digest FROM security_bootstrap WHERE id=1").get("digest"));assertEquals(1,number(one(c,"SELECT COUNT(*) n FROM users"),"n"));assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM auctions"),"n"));assertEquals(0,number(one(c,"SELECT total_balance n FROM wallets WHERE user_id=?",id),"n"));}
    }
    @Test void concurrentAdmissionUnknownAccountAndBoundedHashing()throws Exception{
        var pool=Executors.newFixedThreadPool(8);var results=new ArrayList<Future<Integer>>();
        try{for(int i=0;i<18;i++)results.add(pool.submit(()->{try{new SecurityService(db,true).login("unknown@example.com","incorrect","source-limited");return 200;}catch(Fault e){return e.status;}}));int limited=0;for(var f:results){int code=f.get(30,TimeUnit.SECONDS);assertTrue(code==401||code==429);if(code==429)limited++;}assertTrue(limited>=8);
        }finally{pool.shutdownNow();}
        assertThrows(Fault.class,()->new SecurityService(db,true).login("unknown@example.com","incorrect","other-source"));
    }
    @Test void logoutRotationAndDurableSessionState()throws Exception{
        String email="rotate@example.com",pass="Initial-private-password!";long id;
        try(var c=db.connection()){update(c,"INSERT INTO users(email,password_hash,role,kind) VALUES(?,?,'BIDDER','HUMAN')",email,new PasswordHasher().hash(pass.toCharArray()));id=number(one(c,"SELECT id FROM users WHERE email=?",email),"id");}
        var service=new SecurityService(db,true);var first=(Map<?,?>)service.login(email,pass,"rotate-source");String token=(String)first.get("token");
        service.revoke(id,id,Api.digest(token));
        try(var c=db.connection()){assertNotNull(one(c,"SELECT revoked_at FROM auth_sessions WHERE digest=?",Api.digest(token)).get("revoked_at"));}
        var next=(Map<?,?>)new SecurityService(db,true).login(email,pass,"rotate-source");service.rotate(id,pass,"Rotated-private-password!");
        assertThrows(Fault.class,()->service.login(email,pass,"rotate-source"));
        try(var c=db.connection()){assertEquals("PASSWORD_ROTATED",one(c,"SELECT revoke_reason FROM auth_sessions WHERE digest=?",Api.digest((String)next.get("token"))).get("revoke_reason"));}
        assertNotNull(new SecurityService(db,true).login(email,"Rotated-private-password!","rotate-source"));
    }
    @Test void saturatedGlobalWindowDoesNotCreateAttackerBuckets()throws Exception{
        try(var c=db.connection()){
            update(c,"INSERT INTO login_windows(bucket,window_start,attempts) VALUES(?,UTC_TIMESTAMP(6),201) ON DUPLICATE KEY UPDATE window_start=UTC_TIMESTAMP(6),attempts=201",Api.digest("0/global"));
            long before=number(one(c,"SELECT COUNT(*) n FROM login_windows"),"n");
            try{for(int i=0;i<25;i++){final int n=i;var error=assertThrows(Fault.class,()->new SecurityService(db,true).login("attacker"+n+"@example.com","incorrect","new-source-"+n));assertEquals(429,error.status);}assertEquals(before,number(one(c,"SELECT COUNT(*) n FROM login_windows"),"n"));}
            finally{update(c,"DELETE FROM login_windows WHERE bucket=?",Api.digest("0/global"));}
        }
    }
    @Test void databaseEquivalentEmailAliasesShareAdmissionAndSuccessReset()throws Exception{
        String suffix=UUID.randomUUID().toString(),email="owner-"+suffix+"@example.test",alias="\u00f3wn\u00e9r-"+suffix+"@example.test",pass="Private-canonical-password!";long id;
        try(var c=db.connection()){
            update(c,"INSERT INTO users(email,password_hash,role,kind) VALUES(?,?,'BIDDER','HUMAN')",email,new PasswordHasher().hash(pass.toCharArray()));
            id=number(one(c,"SELECT id FROM users WHERE email=?",alias),"id");
        }
        var service=new SecurityService(db,true);String source="canonical-"+suffix;
        for(int i=0;i<9;i++)assertEquals(401,assertThrows(Fault.class,()->service.login(email,"incorrect",source)).status);
        assertNotNull(service.login(alias,pass,source),"Equivalent alias must log into the same account");
        try(var c=db.connection()){assertEquals(0,number(one(c,"SELECT COUNT(*) n FROM login_windows WHERE bucket=?",Api.digest("2/account/user/"+id)),"n"),"Successful login resets the canonical account bucket");}
        for(int i=0;i<10;i++)assertEquals(401,assertThrows(Fault.class,()->service.login(email,"incorrect",source)).status);
        assertEquals(429,assertThrows(Fault.class,()->new SecurityService(db,true).login(alias,"incorrect","different-source-"+suffix)).status,"Collation aliases cannot bypass the account quota from another instance/source");
    }
}
