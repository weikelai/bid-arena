package dev.bidarena;

import java.util.Map;

public record AppConfig(String databaseUrl, String databaseUser, String databasePassword,
                        String migrationUser, String migrationPassword,
                        String environment, boolean seedDemo, boolean secureProduction) {
    public AppConfig(String url,String user,String password,String environment,boolean seed){this(url,user,password,user,password,environment,seed,false);}
    public static AppConfig from(Map<String, String> env) {return from(env,false);}
    public static AppConfig from(Map<String,String> env,boolean migrationOnly) {
        String environment = env.getOrDefault("APP_ENV", "production");
        String flag = env.getOrDefault("SEED_DEMO", "false");
        if (!flag.equals("true") && !flag.equals("false")) throw new IllegalArgumentException("SEED_DEMO must be true or false");
        boolean seed = Boolean.parseBoolean(flag);
        if (!environment.equals("development")&&!environment.equals("production"))throw new IllegalArgumentException("APP_ENV must be development or production");
        boolean secure=environment.equals("production");
        if (seed && (!environment.equals("development")||secure)) {
            throw new IllegalArgumentException("Demo seeding requires APP_ENV=development");
        }
        String url = required(env, "DB_URL");
        if (!url.startsWith("jdbc:mysql:")) throw new IllegalArgumentException("Only MySQL is supported");
        String user=required(env,migrationOnly?"MIGRATION_DB_USER":"DB_USER"),password=required(env,migrationOnly?"MIGRATION_DB_PASSWORD":"DB_PASSWORD");
        if(secure&&!migrationOnly&&(env.containsKey("MIGRATION_DB_PASSWORD")||env.containsKey("MIGRATION_DB_USER")))throw new IllegalArgumentException("Do not supply migration credentials to runtime");
        if(secure&&!migrationOnly&&!env.getOrDefault("APPROVED_HTTPS_PROXY","false").equals("true"))throw new IllegalArgumentException("Production security requires an approved HTTPS proxy");
        return new AppConfig(url,user,password,user,password,environment,seed,secure);
    }

    private static String required(Map<String, String> env, String key) {
        String value = env.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing environment variable: " + key);
        return value;
    }
}
