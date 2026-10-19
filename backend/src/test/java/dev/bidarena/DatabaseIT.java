package dev.bidarena;

import org.junit.jupiter.api.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Requires a real MySQL server and CREATE DATABASE permission. Never touches the application schema. */
class DatabaseIT {
    @Test void poolWaitGaugeAndRealAcquireTimeoutAreObservable()throws Exception {
        try(var c=database.connection();var statement=c.createStatement()){
            SQLException denied=assertThrows(SQLException.class,()->statement.executeQuery("SELECT User FROM mysql.user LIMIT 0"));
            assertTrue(Set.of(1044,1142).contains(denied.getErrorCode()),"test identity must not read system accounts");
        }
        var held=new ArrayList<Connection>();var executor=Executors.newSingleThreadExecutor();
        long timeouts=database.metrics.count("connection.acquireTimeouts");
        try{
            for(int i=0;i<8;i++)held.add(database.connection());
            var waiter=executor.submit(()->{try(var c=database.connection()){return 0;}catch(SQLException e){assertInstanceOf(SQLTransientConnectionException.class,e);return 1;}});
            long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean queued=false;
            while(System.nanoTime()<until){var pool=(Map<?,?>)database.metricsSnapshot().get("pool");if(((Number)pool.get("waiting")).intValue()==1){assertEquals(8,((Number)pool.get("active")).intValue());queued=true;break;}Thread.sleep(20);}
            assertTrue(queued,"actual pool waiter must be observable");assertEquals(1,waiter.get(40,TimeUnit.SECONDS));assertEquals(timeouts+1,database.metrics.count("connection.acquireTimeouts"));
            System.out.println("POOL_REAL_TIMEOUT active=8 waitingObserved=1 acquireTimeoutDelta=1 budgetMs=30000");
        }finally{for(var c:held)c.close();executor.shutdownNow();}
        assertEquals(0,((Number)((Map<?,?>)database.metricsSnapshot().get("pool")).get("waiting")).intValue());
    }
    private static Database database;
    private static String schema;
    private static String adminUrl;
    private static String user;
    private static String password;

    @BeforeAll static void provisionUniqueSchema() throws Exception {
        adminUrl = required("TEST_DB_URL");
        user = required("TEST_DB_USER"); password = required("TEST_DB_PASSWORD");
        assertTrue(adminUrl.startsWith("jdbc:mysql:"), "Tests require real MySQL");
        schema = "bid_arena_it_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection connection = DriverManager.getConnection(adminUrl,user,password);
             Statement statement = connection.createStatement()) {
            String version = connection.getMetaData().getDatabaseProductVersion();
            assertTrue(version.startsWith("8."), "Requires MySQL 8, got " + version);
            System.out.println("REAL_MYSQL_VERSION=" + version);
            statement.executeUpdate("CREATE DATABASE `" + schema + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
        }
        String url = adminUrl.substring(0, adminUrl.indexOf('/', "jdbc:mysql://".length()) + 1) + schema;
        int query = adminUrl.indexOf('?');
        if (query >= 0) url += adminUrl.substring(query);
        database = new Database(new AppConfig(url,user,password,"development",true));
        assertEquals(5, database.migrations().migrate().migrationsExecuted);
        // Run two bootstraps simultaneously, then migrate and seed again.
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> jobs = new ArrayList<>();
            for (int i=0; i<2; i++) jobs.add(pool.submit(() -> {
                try { new DemoSeeder().initialize(database); } catch (SQLException e) { throw new RuntimeException(e); }
            }));
            for (Future<?> job : jobs) job.get(30,TimeUnit.SECONDS);
        } finally { pool.shutdownNow(); }
        assertEquals(0, database.migrations().migrate().migrationsExecuted);
        new DemoSeeder().initialize(database);
    }

    @AfterAll static void cleanOnlyOwnedSchema() throws Exception {
        if (database != null) database.close();
        if (schema != null && schema.matches("bid_arena_it_[a-f0-9]{32}")) {
            try (Connection connection = DriverManager.getConnection(adminUrl,user,password);
                 Statement statement = connection.createStatement()) {
                statement.executeUpdate("DROP DATABASE `" + schema + "`");
            }
        }
    }

    @Test void migrationHistoryIsVersionedAndAllTablesUseInnoDb() throws Exception {
        assertEquals(1, scalar("SELECT COUNT(*) FROM flyway_schema_history WHERE success=1 AND version='1'"));
        assertEquals(0, scalar("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND engine<>'InnoDB'"));
        Set<String> expected=Set.of("users","wallets","auctions","auction_participants","auction_holds","bid_requests","bids","wallet_transactions","auction_results","auction_events","agent_tokens","agent_token_scopes","agent_rate_windows","seed_state","auth_sessions","auction_intake","security_bootstrap","login_windows","security_audit","agent_jobs","agent_job_events");
        Set<String> actual=new HashSet<>();
        try(Connection c=database.connection(); Statement s=c.createStatement(); ResultSet rows=s.executeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name<>'flyway_schema_history'")) {
            while(rows.next()) actual.add(rows.getString(1));
        }
        assertEquals(expected,actual);
        database.migrations().validate();
        long actualChecksum=scalar("SELECT checksum FROM flyway_schema_history WHERE version='1'");
        try (Connection c=database.connection(); Statement s=c.createStatement()) {
            s.executeUpdate("UPDATE flyway_schema_history SET checksum=0 WHERE version='1'");
            try {
                assertThrows(org.flywaydb.core.api.exception.FlywayValidateException.class, () -> database.migrations().validate());
            } finally {
                // Restore the actual resource checksum, never repair a production migration.
                s.executeUpdate("UPDATE flyway_schema_history SET checksum=" + actualChecksum + " WHERE version='1'");
            }
        }
        database.migrations().validate();
    }

    @Test void repeatedAndConcurrentSeedsIssueExactlyOneInitialCredit() throws Exception {
        assertEquals(3,scalar("SELECT COUNT(*) FROM users"));
        assertEquals(3,scalar("SELECT COUNT(*) FROM wallets WHERE total_balance=1000 AND frozen_balance=0"));
        assertEquals(3,scalar("SELECT COUNT(*) FROM wallet_transactions WHERE type='INITIAL_CREDIT'"));
        assertEquals(3000,scalar("SELECT SUM(delta_total) FROM wallet_transactions"));
        assertEquals(1,scalar("SELECT COUNT(*) FROM auctions WHERE status='DRAFT' AND end_at IS NULL AND start_price=100 AND current_price=100 AND min_increment=10 AND duration_seconds=180 AND leader_id IS NULL AND extension_count=0"));
        assertEquals(0,scalar("SELECT COUNT(*) FROM agent_tokens"));
        try(Connection c=database.connection(); Statement s=c.createStatement(); ResultSet rows=s.executeQuery("SELECT email,password_hash FROM users")) {
            PasswordHasher hasher = new PasswordHasher();
            while(rows.next()) {
                String expected = rows.getString(1).equals("admin@example.com") ? "Admin123456!" : "Test123456!";
                assertNotEquals(expected,rows.getString(2));
                assertTrue(hasher.verify(expected.toCharArray(), rows.getString(2)));
            }
        }
    }

    @Test void seedDoesNotResetExistingBalance() throws Exception {
        long userId=scalar("SELECT id FROM users WHERE email='bidder_a@example.com'");
        assertThrows(SQLException.class, () -> database.transaction(c -> {
            try (Statement s=c.createStatement()) {
                s.executeUpdate("UPDATE wallets SET frozen_balance=10,version=version+1 WHERE user_id="+userId);
                new DemoSeeder().initialize(database);
                try(ResultSet r=s.executeQuery("SELECT frozen_balance FROM wallets WHERE user_id="+userId)){r.next();assertEquals(10,r.getLong(1));}
                // The outer transaction is rolled back to leave the shared fixture unchanged.
                throw new SQLException("intentional rollback");
            }
        }));
    }

    @Test void checksForeignKeysAndUniqueBusinessKeysAreEnforced() throws Exception {
        long uid=scalar("SELECT MIN(id) FROM users");
        long auction=scalar("SELECT MIN(id) FROM auctions");
        try(Connection c=database.connection(); Statement s=c.createStatement()) {
            c.setAutoCommit(false);
            try {
                assertEquals(3819,assertThrows(SQLException.class, () -> s.executeUpdate("UPDATE wallets SET frozen_balance=1001 WHERE user_id="+uid)).getErrorCode());
                assertEquals(3819,assertThrows(SQLException.class, () -> s.executeUpdate("UPDATE wallets SET total_balance=-1 WHERE user_id="+uid)).getErrorCode());
                assertEquals(1452,assertThrows(SQLException.class, () -> s.executeUpdate("INSERT INTO wallets(user_id) VALUES (9223372036854775807)")).getErrorCode());
                assertEquals(1062,assertThrows(SQLException.class, () -> s.executeUpdate("INSERT INTO wallet_transactions(user_id,effect_key,type,delta_total,delta_frozen,total_after,frozen_after) SELECT user_id,effect_key,type,delta_total,delta_frozen,total_after,frozen_after FROM wallet_transactions LIMIT 1")).getErrorCode());
                String request="INSERT INTO bid_requests(user_id,request_id,auction_id,payload_hash,received_at) VALUES ("+uid+",'same-id',"+auction+",UNHEX(SHA2('payload',256)),UTC_TIMESTAMP(6))";
                s.executeUpdate(request);
                assertEquals(1062,assertThrows(SQLException.class, () -> s.executeUpdate(request)).getErrorCode());
                long other=scalar("SELECT MAX(id) FROM users");
                s.executeUpdate("INSERT INTO bid_requests(user_id,request_id,auction_id,payload_hash,received_at) VALUES ("+other+",'same-id',"+auction+",UNHEX(SHA2('payload',256)),UTC_TIMESTAMP(6))");
                s.executeUpdate("INSERT INTO auction_results(auction_id,price,reason) VALUES ("+auction+",0,'NO_BIDS')");
                assertEquals(1062,assertThrows(SQLException.class, () -> s.executeUpdate("INSERT INTO auction_results(auction_id,price,reason) VALUES ("+auction+",0,'NO_BIDS')")).getErrorCode());
            } finally {c.rollback();}
        }
    }

    @Test void jdbcTransactionRollsBackAllWritesOnFailure() throws Exception {
        long uid=scalar("SELECT MIN(id) FROM users");
        assertThrows(SQLException.class, () -> database.transaction(c -> {
            try(Statement s=c.createStatement()) {
                s.executeUpdate("UPDATE wallets SET total_balance=999,version=version+1 WHERE user_id="+uid);
                s.executeUpdate("UPDATE auctions SET title='must roll back'");
                throw new SQLException("injected failure after two updates");
            }
        }));
        assertEquals(1000,scalar("SELECT total_balance FROM wallets WHERE user_id="+uid));
        assertEquals(0,scalar("SELECT COUNT(*) FROM auctions WHERE title='must roll back'"));
    }

    @Test void executableJarMigratesAndSeedsOnTwoRealProcessStarts() throws Exception {
        String dbUrl;
        try(Connection c=database.connection()){dbUrl=c.getMetaData().getURL();}
        for(int attempt=0;attempt<2;attempt++) {
            int port;
            try(var socket=new java.net.ServerSocket(0)){port=socket.getLocalPort();}
            String javaExecutable=java.nio.file.Path.of(System.getProperty("java.home"),"bin","java").toString();
            ProcessBuilder builder=new ProcessBuilder(javaExecutable,"-jar","target/bid-arena.jar");
            builder.environment().putAll(Map.of("APP_ENV","development","SEED_DEMO","true","DB_URL",dbUrl,"DB_USER",user,"DB_PASSWORD",password,"BACKEND_PORT",String.valueOf(port)));
            builder.redirectErrorStream(true).redirectOutput(new java.io.File("target/boot-"+attempt+".log"));
            Process process=builder.start();
            try {
                var client=java.net.http.HttpClient.newBuilder().connectTimeout(java.time.Duration.ofSeconds(1)).build();
                var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://127.0.0.1:"+port+"/api/v1/health")).timeout(java.time.Duration.ofSeconds(2)).build();
                boolean ready=false;
                for(int retry=0;retry<100 && process.isAlive();retry++) {
                    try {
                        var response=client.send(request,java.net.http.HttpResponse.BodyHandlers.ofString());
                        if(response.statusCode()==200 && response.body().contains("\"database\":\"UP\"")){ready=true;break;}
                    } catch(java.io.IOException ignored) { }
                    Thread.sleep(100);
                }
                assertTrue(ready,"Backend not ready; inspect target/boot-"+attempt+".log");
                assertEquals(3,scalar("SELECT COUNT(*) FROM users"));
                assertEquals(3,scalar("SELECT COUNT(*) FROM wallet_transactions"));
                assertEquals(3000,scalar("SELECT SUM(total_balance) FROM wallets"));
                assertEquals(1,scalar("SELECT COUNT(*) FROM auctions WHERE status='DRAFT' AND end_at IS NULL"));
            } finally {
                process.destroy();
                if(!process.waitFor(10,TimeUnit.SECONDS)){process.destroyForcibly();process.waitFor(10,TimeUnit.SECONDS);}
            }
        }
    }

    private static long scalar(String sql) throws SQLException {
        try(Connection c=database.connection(); Statement s=c.createStatement(); ResultSet r=s.executeQuery(sql)){r.next();return r.getLong(1);}
    }
    private static String required(String key) {
        String value=System.getenv(key);
        if(value==null || value.isBlank()) throw new IllegalStateException(key+" is required; integration tests must not silently skip");
        return value;
    }
}
