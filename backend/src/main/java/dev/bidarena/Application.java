package dev.bidarena;

import org.noear.solon.Solon;

public final class Application {
    public static void main(String[] args) throws Exception {
        if(args.length>0&&args[0].equals("migrate")){AppConfig cfg=AppConfig.from(System.getenv(),true);try(Database db=new Database(cfg)){db.migrations().migrate();}return;}
        if(args.length>0&&args[0].equals("prepare-admin-bootstrap")){AppConfig cfg=AppConfig.from(System.getenv(),true);try(Database db=new Database(cfg)){System.out.println(SecurityService.prepareBootstrap(db));}return;}
        if(args.length>0&&args[0].equals("consume-admin-bootstrap")){AppConfig cfg=AppConfig.from(System.getenv(),true);var input=new java.io.BufferedReader(new java.io.InputStreamReader(System.in));String secret=input.readLine(),email=input.readLine(),password=input.readLine();if(secret==null||email==null||password==null)throw new IllegalArgumentException("Supply token, email and password on separate stdin lines");try(Database db=new Database(cfg)){System.out.println(SecurityService.consumeBootstrap(db,secret,email,password));}return;}
        AppConfig config = AppConfig.from(System.getenv());
        Database database = new Database(config);
        try {
            if(config.secureProduction())database.migrations().validate();else database.migrations().migrate();
            if (config.seedDemo()) new DemoSeeder().initialize(database);
            Api api=new Api(database,config.secureProduction());
            Runtime.getRuntime().addShutdownHook(new Thread(database::close));
            Solon.start(Application.class, args, app -> {
                api.register(app);
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
