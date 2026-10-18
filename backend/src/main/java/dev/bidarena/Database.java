package dev.bidarena;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import java.sql.Connection;
import java.sql.SQLException;

public final class Database implements AutoCloseable {
    private final HikariDataSource source;

    public Database(AppConfig config) {
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
        return Flyway.configure().dataSource(source).locations("classpath:db/migration")
                .validateMigrationNaming(true).validateOnMigrate(true).cleanDisabled(true).load();
    }

    public Connection connection() throws SQLException { return source.getConnection(); }

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
                try { connection.rollback(); } catch (SQLException rollbackError) { e.addSuppressed(rollbackError); }
                throw e;
            }
        }
    }

    @Override public void close() { source.close(); }
}
