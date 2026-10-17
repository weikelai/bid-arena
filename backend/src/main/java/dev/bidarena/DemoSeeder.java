package dev.bidarena;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;

public final class DemoSeeder {
    private final PasswordHasher hasher = new PasswordHasher();

    public void initialize(Database database) throws SQLException {
        database.transaction(connection -> {
            // One database row serializes concurrent bootstraps across all instances.
            try (var statement = connection.createStatement()) {
                statement.executeUpdate("INSERT INTO seed_state(seed_key) VALUES ('demo-v1') ON DUPLICATE KEY UPDATE seed_key=seed_key");
                try (ResultSet rows = statement.executeQuery("SELECT completed_at FROM seed_state WHERE seed_key='demo-v1' FOR UPDATE")) {
                    rows.next();
                    if (rows.getTimestamp(1) != null) return null;
                }
            }
            createUser(connection, "admin@example.com", "ADMIN", "Admin123456!".toCharArray());
            createUser(connection, "bidder_a@example.com", "BIDDER", "Test123456!".toCharArray());
            createUser(connection, "bidder_b@example.com", "BIDDER", "Test123456!".toCharArray());
            try (PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO auctions(seed_key,title,status,start_price,current_price,min_increment,duration_seconds,created_by)
                    SELECT 'demo-auction-v1','Bid Arena Demo','DRAFT',100,100,10,180,id
                    FROM users WHERE email='admin@example.com'
                    """)) {
                if (statement.executeUpdate() != 1) throw new SQLException("Missing demo administrator");
            }
            try (var statement = connection.createStatement()) {
                statement.executeUpdate("INSERT INTO auction_intake(auction_id) SELECT id FROM auctions WHERE seed_key='demo-auction-v1' ON DUPLICATE KEY UPDATE auction_id=auction_id");
                statement.executeUpdate("UPDATE seed_state SET completed_at=UTC_TIMESTAMP(6) WHERE seed_key='demo-v1'");
            }
            return null;
        });
    }

    private void createUser(Connection connection, String email, String role, char[] password) throws SQLException {
        // A pre-existing unmarked demo identity is a conflict, never reset or re-credit it.
        String hash;
        try { hash = hasher.hash(password); } finally { Arrays.fill(password, '\0'); }
        long id;
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO users(email,password_hash,role,status,kind) VALUES (?, ?, ?, 'ACTIVE', 'HUMAN')",
                java.sql.Statement.RETURN_GENERATED_KEYS)) {
            statement.setString(1, email); statement.setString(2, hash); statement.setString(3, role);
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) { keys.next(); id = keys.getLong(1); }
        }
        try (PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO wallets(user_id,total_balance,frozen_balance) VALUES (?,1000,0)")) {
            statement.setLong(1, id); statement.executeUpdate();
        }
        try (PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO wallet_transactions(user_id,type,delta_total,delta_frozen,total_after,frozen_after,effect_key)
                VALUES (?,'INITIAL_CREDIT',1000,0,1000,0,?)
                """)) {
            statement.setLong(1, id); statement.setString(2, "seed/demo-v1/" + email);
            statement.executeUpdate();
        }
    }
}
