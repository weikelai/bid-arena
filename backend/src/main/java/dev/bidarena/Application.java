package dev.bidarena;

import org.noear.solon.Solon;

public final class Application {
    public static void main(String[] args) throws Exception {
        AppConfig config = AppConfig.from(System.getenv());
        Database database = new Database(config);
        try {
            database.migrations().migrate();
            if (config.seedDemo()) new DemoSeeder().initialize(database);
            Runtime.getRuntime().addShutdownHook(new Thread(database::close));
            Solon.start(Application.class, args, app -> {
                new Api(database).register(app);
                app.get("/api/v1/health/live", ctx -> ctx.outputAsJson("{\"status\":\"UP\"}"));
                app.get("/api/v1/health", ctx -> {
                    try (var connection = database.connection(); var statement = connection.createStatement();
                         var rows = statement.executeQuery("SELECT 1")) {
                        if (!rows.next()) throw new IllegalStateException("Database unavailable");
                        ctx.outputAsJson("{\"status\":\"UP\",\"database\":\"UP\"}");
                    } catch (Exception unavailable) {
                        ctx.status(503);
                        ctx.outputAsJson("{\"status\":\"DOWN\",\"database\":\"DOWN\"}");
                    }
                });
            });
        } catch (Throwable failure) {
            database.close();
            throw failure;
        }
    }
}
