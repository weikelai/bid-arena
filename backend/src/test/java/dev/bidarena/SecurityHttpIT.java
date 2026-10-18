package dev.bidarena;

import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.noear.snack4.ONode;
import static dev.bidarena.Sql.*;
import static org.junit.jupiter.api.Assertions.*;

class SecurityHttpIT {
    final HttpClient client=HttpClient.newHttpClient();String base;Process backend;
    HttpResponse<String> call(String path,String token,String data)throws Exception {
        var r=HttpRequest.newBuilder(URI.create(base+path)).version(HttpClient.Version.HTTP_1_1).timeout(Duration.ofSeconds(10)).header("X-Forwarded-For",UUID.randomUUID().toString());
        if(token!=null)r.header("Authorization","Bearer "+token);
        if(data!=null)r.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(data));
        return HttpClient.newHttpClient().send(r.build(),HttpResponse.BodyHandlers.ofString());
    }
    String login(String email,String password)throws Exception{var r=call("/auth/login",null,json(Map.of("email",email,"password",password)));assertEquals(200,r.statusCode(),r.body());return ONode.ofJson(r.body()).get("token").getString();}
    void start(String jdbc)throws Exception{
        int port;try(var s=new ServerSocket(0)){port=s.getLocalPort();}base="http://127.0.0.1:"+port+"/api/v1";
        var b=new ProcessBuilder(java.nio.file.Path.of(System.getProperty("java.home"),"bin","java").toString(),"-jar","target/bid-arena.jar");
        b.environment().remove("MIGRATION_DB_USER");b.environment().remove("MIGRATION_DB_PASSWORD");
        b.environment().putAll(Map.of("DB_URL",jdbc,"DB_USER",System.getenv("TEST_RUNTIME_USER"),"DB_PASSWORD",System.getenv("TEST_RUNTIME_PASSWORD"),"APP_ENV","production","SEED_DEMO","false","APPROVED_HTTPS_PROXY","true","BACKEND_PORT",""+port));
        backend=b.redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.appendTo(new java.io.File("target/security-http-backend.log"))).start();
        for(int i=0;i<150&&backend.isAlive();i++){try{if(call("/health",null,null).statusCode()==200)return;}catch(Exception ignored){}Thread.sleep(100);}fail("Production backend failed; inspect security-http-backend.log");
    }
    void stop()throws Exception{if(backend!=null){backend.destroy();if(!backend.waitFor(10,TimeUnit.SECONDS))backend.destroyForcibly();}}
    @Test void productionRuntimeLogoutExpiryRotationAdminAndSpoofedSource()throws Exception{
        String url=Objects.requireNonNull(System.getenv("TEST_DB_URL")),user=System.getenv("TEST_DB_USER"),password=System.getenv("TEST_DB_PASSWORD"),schema="bid_arena_it_"+UUID.randomUUID().toString().replace("-","");
        String jdbc=url.substring(0,url.indexOf('/',"jdbc:mysql://".length())+1)+schema+(url.contains("?")?url.substring(url.indexOf('?')):"");
        try(var c=DriverManager.getConnection(url,user,password)){update(c,"CREATE DATABASE `"+schema+"`");}
        try {
            // Fixtures only: production process itself must not seed or migrate.
            try(var db=new Database(new AppConfig(jdbc,user,password,"development",true))){db.migrations().migrate();new DemoSeeder().initialize(db);}
            start(jdbc);String a=login("bidder_a@example.com","Test123456!"),admin=login("admin@example.com","Admin123456!");
            assertEquals(403,call("/admin/users/2/revoke-sessions",a,"{}").statusCode());
            assertEquals(200,call("/auth/logout",a,"{}").statusCode());assertTrue(call("/users/me",a,null).body().contains("SESSION_REVOKED"));
            stop();start(jdbc);assertEquals(401,call("/users/me",a,null).statusCode());
            String b=login("bidder_b@example.com","Test123456!");long bid;
            try(var c=DriverManager.getConnection(jdbc,user,password)){bid=number(one(c,"SELECT id FROM users WHERE email='bidder_b@example.com'"),"id");}
            assertEquals(200,call("/admin/users/"+bid+"/revoke-sessions",admin,"{}").statusCode());assertEquals(401,call("/users/me",b,null).statusCode());
            String expired=login("bidder_b@example.com","Test123456!");try(var c=DriverManager.getConnection(jdbc,user,password)){update(c,"UPDATE auth_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE digest=?",Api.digest(expired));}
            assertTrue(call("/users/me",expired,null).body().contains("SESSION_EXPIRED"));
            String rotating=login("bidder_b@example.com","Test123456!");assertEquals(200,call("/auth/change-password",rotating,json(Map.of("currentPassword","Test123456!","newPassword","New-private-password-123!"))).statusCode());assertEquals(401,call("/users/me",rotating,null).statusCode());login("bidder_b@example.com","New-private-password-123!");
            int rejected=0;for(int i=0;i<14;i++){var r=call("/auth/login",null,json(Map.of("email","absent@example.com","password","incorrect")));assertTrue(r.statusCode()==401||r.statusCode()==429);if(r.statusCode()==429)rejected++;}assertTrue(rejected>=4,"Spoofed forwarding headers must not bypass account limit");
            assertEquals(200,call("/openapi.json",null,null).statusCode());
        }finally{stop();try(var c=DriverManager.getConnection(url,user,password)){update(c,"DROP DATABASE `"+schema+"`");}}
    }
}
