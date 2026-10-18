package dev.bidarena;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import java.sql.Connection;
import java.sql.SQLException;

public final class Database implements AutoCloseable {
    private final HikariDataSource source;
    final Metrics metrics=new Metrics();
    private final AppConfig config;

    public Database(AppConfig config) {
        this.config=config;
        HikariConfig pool = new HikariConfig();
        pool.setJdbcUrl(config.databaseUrl());
        pool.setUsername(config.databaseUser());
        pool.setPassword(config.databasePassword());
        pool.setMaximumPoolSize(8);
        pool.setMinimumIdle(1);
        // A burst can queue behind an auction's row lock. Keep the bounded pool,
        // but allow the normal Hikari wait budget instead of failing at 5 seconds.
        pool.setConnectionTimeout(30000);
        pool.setTransactionIsolation("TRANSACTION_READ_COMMITTED");
        pool.setConnectionInitSql("SET time_zone = '+00:00'");
        source = new HikariDataSource(pool);
    }

    public Flyway migrations() {
        return Flyway.configure().dataSource(config.databaseUrl(),config.migrationUser(),config.migrationPassword()).locations("classpath:db/migration")
                .validateMigrationNaming(true).validateOnMigrate(true).cleanDisabled(true).load();
    }

    public Connection connection() throws SQLException {
        long start=System.nanoTime();
        try{return source.getConnection();}
        catch(SQLException e){metrics.increment("connection.acquireFailures");if(e instanceof java.sql.SQLTransientConnectionException)metrics.increment("connection.acquireTimeouts");throw e;}
        finally{metrics.observe("connection.acquire",System.nanoTime()-start);}
    }

    public java.util.Map<String,Object> metricsSnapshot(){
        var out=new java.util.LinkedHashMap<String,Object>();var pool=source.getHikariPoolMXBean();
        out.put("pool",java.util.Map.of("active",pool.getActiveConnections(),"idle",pool.getIdleConnections(),"total",pool.getTotalConnections(),"waiting",pool.getThreadsAwaitingConnection(),"maximum",8));
        out.put("metrics",metrics.snapshot());out.put("uptimeMs",java.lang.management.ManagementFactory.getRuntimeMXBean().getUptime());
        var os=java.lang.management.ManagementFactory.getOperatingSystemMXBean();var memory=java.lang.management.ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        out.put("heapUsedBytes",memory.getUsed());out.put("heapCommittedBytes",memory.getCommitted());
        if(os instanceof com.sun.management.OperatingSystemMXBean cpu){out.put("processCpuLoad",cpu.getProcessCpuLoad());out.put("processCpuTimeNs",cpu.getProcessCpuTime());}
        return out;
    }

    @FunctionalInterface
    public interface Work<T> { T run(Connection connection) throws SQLException; }

    public <T> T transaction(Work<T> work) throws SQLException {
        try (Connection connection = connection()) {
            connection.setAutoCommit(false);
            try {
                T result = work.run(connection);
                connection.commit();
                return result;
            } catch (SQLException | RuntimeException | Error e) {
                if(e instanceof SQLException sql){if(sql.getErrorCode()==1213)metrics.increment("sql.deadlocks");if(sql.getErrorCode()==1205)metrics.increment("sql.lockTimeouts");}
                try { connection.rollback(); } catch (SQLException rollbackError) { e.addSuppressed(rollbackError); }
                throw e;
            }
        }
    }

    @Override public void close() { source.close(); }
}
