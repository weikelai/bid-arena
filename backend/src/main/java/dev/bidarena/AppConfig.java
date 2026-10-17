package dev.bidarena;

import java.util.Map;

public record AppConfig(String databaseUrl, String databaseUser, String databasePassword,
                        String environment, boolean seedDemo) {
    public static AppConfig from(Map<String, String> env) {
        String environment = env.getOrDefault("APP_ENV", "production");
        String flag = env.getOrDefault("SEED_DEMO", "false");
        if (!flag.equals("true") && !flag.equals("false")) throw new IllegalArgumentException("SEED_DEMO must be true or false");
        boolean seed = Boolean.parseBoolean(flag);
        if (seed && !environment.equals("development")) {
            throw new IllegalArgumentException("Demo seeding requires APP_ENV=development");
        }
        String url = required(env, "DB_URL");
        if (!url.startsWith("jdbc:mysql:")) throw new IllegalArgumentException("Only MySQL is supported");
        return new AppConfig(url, required(env, "DB_USER"), required(env, "DB_PASSWORD"), environment, seed);
    }

    private static String required(Map<String, String> env, String key) {
        String value = env.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing environment variable: " + key);
        return value;
    }
}
