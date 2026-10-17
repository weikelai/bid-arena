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
        AppConfig config = AppConfig.from(base());
        assertEquals("production", config.environment());
        assertFalse(config.seedDemo());
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
