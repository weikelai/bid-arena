package dev.bidarena;

import java.sql.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import static dev.bidarena.Sql.*;

/** Persistent cross-instance admission limits. Never trusts forwarded address headers. */
final class SecurityService {
    private static final Semaphore HASH_SLOTS=new Semaphore(4);
    private final Database db;
    private final boolean strict;
    private final PasswordHasher passwords=new PasswordHasher();
    private static final String DUMMY=new PasswordHasher().hash("not-a-real-user-password".toCharArray());
    SecurityService(Database db,boolean strict){this.db=db;this.strict=strict;}
    Object login(String email,String password,String source)throws SQLException {
        if(email.length()>254||password.length()>256)throw new Fault(400,"INVALID_REQUEST");
        email=email.trim().toLowerCase(Locale.ROOT);
        final String account=email;
        boolean admitted=db.transaction(c->{
            String[] keys={"0/global","1/source/"+source,null};
            int[] caps={strict?200:100000,strict?40:50000,strict?10:10000};
            for(int i=0;i<keys.length;i++){
                if(i==2){
                    // Use the same MySQL email comparison as credential lookup:
                    // ai_ci aliases must share one limit instead of multiplying guesses.
                    // Resolve only after global/source admission to bound this lookup.
                    var identities=rows(c,"SELECT id FROM users WHERE email=?",account);
                    keys[i]="2/account/"+(identities.isEmpty()?"missing/"+account:"user/"+number(identities.get(0),"id"));
                }
                byte[] key=Api.digest(keys[i]);
                update(c,"INSERT INTO login_windows(bucket,window_start,attempts) VALUES(?,UTC_TIMESTAMP(6),1) ON DUPLICATE KEY UPDATE attempts=IF(window_start<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE),1,LEAST(attempts+1,100001)),window_start=IF(window_start<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE),UTC_TIMESTAMP(6),window_start)",key);
                // Commit the saturated parent bucket without creating arbitrary new
                // account/source buckets after the global/source limit is reached.
                if(number(one(c,"SELECT attempts FROM login_windows WHERE bucket=?",key),"attempts")>caps[i])return false;
            }
            return true;
        });
        if(!admitted){db.metrics.increment("auth.rateLimited");throw new Fault(429,"LOGIN_RATE_LIMITED");}
        if(strict&&!HASH_SLOTS.tryAcquire())throw new Fault(429,"LOGIN_BUSY");
        try {
            Map<String,Object> user;
            try(var c=db.connection()){var found=rows(c,"SELECT * FROM users WHERE email=? AND status='ACTIVE' AND kind='HUMAN'",account);user=found.isEmpty()?null:found.get(0);}
            String hash=user==null?DUMMY:(String)user.get("password_hash");
            boolean valid=passwords.verify(password.toCharArray(),hash);
            if(!valid||user==null){db.metrics.increment("auth.loginFailures");throw new Fault(401,"INVALID_CREDENTIALS");}
            long id=number(user,"id");String token=token();
            return db.transaction(c->{
                var current=one(c,"SELECT password_hash,status FROM users WHERE id=? FOR UPDATE",id);
                if(!hash.equals(current.get("password_hash"))||!"ACTIVE".equals(current.get("status")))throw new Fault(401,"INVALID_CREDENTIALS");
                update(c,"INSERT INTO auth_sessions(digest,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 8 HOUR))",Api.digest(token),id);
                update(c,"DELETE FROM login_windows WHERE bucket=?",Api.digest("2/account/user/"+id));
                audit(c,"LOGIN_SUCCESS",id,id);
                return Map.of("token",token,"role",user.get("role"),"userId",id);
            });
        }finally{if(strict)HASH_SLOTS.release();}
    }
    void revoke(long actor,long user,byte[] current)throws SQLException {
        db.transaction(c->{
            if(current==null)update(c,"UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(6),revoke_reason='ADMIN' WHERE user_id=? AND revoked_at IS NULL",user);
            else update(c,"UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(6),revoke_reason='LOGOUT' WHERE digest=? AND user_id=? AND revoked_at IS NULL",current,user);
            audit(c,"SESSION_REVOKED",actor,user);return null;
        });
    }
    void rotate(long user,String oldPassword,String next)throws SQLException {
        validatePassword(next);
        if(!HASH_SLOTS.tryAcquire())throw new Fault(429,"LOGIN_BUSY");
        try{
            db.transaction(c->{
                var u=one(c,"SELECT password_hash FROM users WHERE id=? FOR UPDATE",user);
                if(!passwords.verify(oldPassword.toCharArray(),(String)u.get("password_hash")))throw new Fault(401,"INVALID_CREDENTIALS");
                update(c,"UPDATE users SET password_hash=? WHERE id=?",passwords.hash(next.toCharArray()),user);
                update(c,"UPDATE auth_sessions SET revoked_at=UTC_TIMESTAMP(6),revoke_reason='PASSWORD_ROTATED' WHERE user_id=? AND revoked_at IS NULL",user);
                audit(c,"PASSWORD_ROTATED",user,user);return null;
            });
        }finally{HASH_SLOTS.release();}
    }
    String prepareBootstrap()throws SQLException {
        String secret=token();
        db.transaction(c->{
            var b=one(c,"SELECT * FROM security_bootstrap WHERE id=1 FOR UPDATE");
            if(b.get("consumed_at")!=null||!rows(c,"SELECT id FROM users WHERE role='ADMIN' LIMIT 1").isEmpty())throw new Fault(409,"ALREADY_INITIALIZED");
            if(b.get("expires_at")!=null&&!rows(c,"SELECT id FROM security_bootstrap WHERE expires_at>UTC_TIMESTAMP(6)").isEmpty())throw new Fault(409,"BOOTSTRAP_PENDING");
            update(c,"UPDATE security_bootstrap SET digest=?,expires_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 10 MINUTE) WHERE id=1",Api.digest(secret));audit(c,"BOOTSTRAP_PREPARED",null,null);return null;
        });return secret;
    }
    long consumeBootstrap(String secret,String email,String password)throws SQLException {
        validatePassword(password);
        if(!email.matches("[^ @]{1,100}@[^ @]{1,100}")||secret.length()>128)throw new Fault(400,"INVALID_REQUEST");
        String hash=passwords.hash(password.toCharArray());
        return db.transaction(c->{
            one(c,"SELECT id FROM security_bootstrap WHERE id=1 FOR UPDATE");
            if(rows(c,"SELECT id FROM security_bootstrap WHERE id=1 AND digest=? AND expires_at>UTC_TIMESTAMP(6) AND consumed_at IS NULL",Api.digest(secret)).isEmpty())throw new Fault(403,"BOOTSTRAP_DENIED");
            if(!rows(c,"SELECT id FROM users WHERE role='ADMIN' LIMIT 1").isEmpty())throw new Fault(409,"ALREADY_INITIALIZED");
            long id;try(var p=prepare(c,"INSERT INTO users(email,password_hash,role,kind) VALUES(?,?,'ADMIN','HUMAN')",email,hash)){p.executeUpdate();try(var r=p.getGeneratedKeys()){r.next();id=r.getLong(1);}}
            update(c,"INSERT INTO wallets(user_id,total_balance) VALUES(?,0)",id);
            update(c,"UPDATE security_bootstrap SET digest=NULL,consumed_at=UTC_TIMESTAMP(6) WHERE id=1");audit(c,"BOOTSTRAP_CONSUMED",id,id);return id;
        });
    }
    void cleanup()throws SQLException {db.transaction(c->{update(c,"DELETE FROM login_windows WHERE window_start<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 10 MINUTE) LIMIT 1000");update(c,"DELETE FROM auth_sessions WHERE expires_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 7 DAY) LIMIT 1000");update(c,"DELETE FROM agent_rate_windows WHERE window_start<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 DAY) LIMIT 1000");return null;});}
    private static void validatePassword(String p){if(p.length()<16||p.length()>128||Set.of("Admin@123456","BidderA@123456","BidderB@123456").contains(p))throw new Fault(400,"WEAK_PASSWORD");}
    static String prepareBootstrap(Database db)throws SQLException {return new SecurityService(db,true).prepareBootstrap();}
    static long consumeBootstrap(Database db,String secret,String email,String password)throws SQLException{return new SecurityService(db,true).consumeBootstrap(secret,email,password);}
    static void audit(Connection c,String type,Long actor,Long target)throws SQLException{update(c,"INSERT INTO security_audit(type,actor_id,target_id) VALUES(?,?,?)",type,actor,target);}
    static String token(){byte[] b=new byte[32];new java.security.SecureRandom().nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b);}
}
