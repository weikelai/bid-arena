package dev.bidarena;

import org.junit.jupiter.api.Test;
import java.util.HashMap;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class AppConfigTest {
    private Map<String,String> base() {
        return new HashMap<>(Map.of("DB_URL","jdbc:mysql://localhost/example", "DB_USER","example", "DB_PASSWORD","test-only"));
    }
    @Test void productionDisablesDemoByDefault() {
        var env=base();assertThrows(IllegalArgumentException.class,()->AppConfig.from(env));
        env.put("APPROVED_HTTPS_PROXY","true");
        AppConfig config = AppConfig.from(env);
        assertEquals("production", config.environment());
        assertFalse(config.seedDemo());
        env.put("MIGRATION_DB_USER","migration");env.put("MIGRATION_DB_PASSWORD","independent-test-only");
        assertThrows(IllegalArgumentException.class,()->AppConfig.from(env));
        assertEquals("migration",AppConfig.from(env,true).databaseUser());
        env.put("APP_ENV","prodution");assertThrows(IllegalArgumentException.class,()->AppConfig.from(env,true));
    }
    @Test void productionCannotEnablePublicDemoPasswords() {
        Map<String,String> env = base(); env.put("SEED_DEMO","true");
        assertThrows(IllegalArgumentException.class, () -> AppConfig.from(env));
        env.put("APP_ENV","development");
        assertTrue(AppConfig.from(env).seedDemo());
    }
    @Test void missingSecretsAndNonMysqlUrlsFailFast() {
        Map<String,String> env = base(); env.remove("DB_PASSWORD");
        assertThrows(IllegalArgumentException.class, () -> AppConfig.from(env));
        env.put("DB_PASSWORD","test-only"); env.put("DB_URL","jdbc:h2:mem:test");
        assertThrows(IllegalArgumentException.class, () -> AppConfig.from(env));
    }
}
