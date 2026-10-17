package dev.bidarena;

import java.sql.*;
import java.time.Instant;
import java.util.*;
import static dev.bidarena.Sql.*;

/** All mutations lock auction first, then wallets in ascending user ID order. */
public final class AuctionService {
    private final Database db;
    @FunctionalInterface interface FaultInjector {void at(String point)throws SQLException;}
    private final FaultInjector faults;
    public AuctionService(Database db){this(db,point->{});}
    AuctionService(Database db,FaultInjector faults){this.db=db;this.faults=faults;}

    public Map<String,Object> snapshot(long auction)throws SQLException {
        try(var c=db.connection()) {
            c.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
            c.setAutoCommit(false);
            // One consistent read, including sequence and result.
            var a=one(c,"SELECT *,UTC_TIMESTAMP(6) server_time FROM auctions WHERE id=?",auction);
            a.put("auctionId",auction);a.put("serverTime",a.get("server_time"));a.put("type","AUCTION_SNAPSHOT");
            a.put("result",rows(c,"SELECT * FROM auction_results WHERE auction_id=?",auction));
            a.put("participants",rows(c,"SELECT p.user_id,p.kind,u.email FROM auction_participants p JOIN users u ON u.id=p.user_id WHERE auction_id=? ORDER BY p.user_id",auction));
            c.commit();return a;
        }
    }

    public long create(long admin,String title,int duration)throws SQLException {
        if(title==null||title.isBlank()||title.length()>200||duration<1||duration>86400)throw new Fault(400,"INVALID_AUCTION");
        return db.transaction(c->{try(var p=prepare(c,"INSERT INTO auctions(title,duration_seconds,created_by) VALUES(?,?,?)",title,duration,admin)) {
            p.executeUpdate();try(var r=p.getGeneratedKeys()){r.next();long id=r.getLong(1);update(c,"INSERT INTO auction_intake(auction_id) VALUES(?)",id);return id;}
        }});
    }

    public void start(long id)throws SQLException {
        db.transaction(c->{var a=lock(c,id);if(!"DRAFT".equals(a.get("status")))throw new Fault(409,"INVALID_STATE");
            update(c,"UPDATE auctions SET status='RUNNING',end_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL duration_seconds SECOND),version=version+1 WHERE id=?",id);
            event(c,id,"AUCTION_STARTED",Map.of());return null;});
    }

    public void join(long id,long user)throws SQLException {
        db.transaction(c->{var a=lock(c,id);if(!Set.of("DRAFT","RUNNING").contains(a.get("status")))throw new Fault(409,"INVALID_STATE");
            if(rows(c,"SELECT 1 FROM auction_participants WHERE auction_id=? AND user_id=?",id,user).isEmpty()) {
                if(update(c,"INSERT INTO auction_participants(auction_id,user_id,kind) SELECT ?,id,kind FROM users WHERE id=? AND status='ACTIVE'",id,user)!=1)throw new Fault(403,"USER_DISABLED");
                event(c,id,"PARTICIPANT_JOINED",Map.of("userId",user));
            }return null;});
    }

    public Map<String,Object> bid(long auction,long user,String request,long amount)throws SQLException {
        if(request==null||!request.matches("[A-Za-z0-9_.:-]{1,64}")||amount<=0||amount>9_000_000_000_000L)throw new Fault(400,"INVALID_BID");
        for(int attempt=0;;attempt++)try {
            db.transaction(c->{
                one(c,"SELECT auction_id FROM auction_intake WHERE auction_id=? FOR UPDATE",auction);
                var prior=rows(c,"SELECT payload_hash FROM bid_requests WHERE user_id=? AND request_id=? FOR UPDATE",user,request);
                if(!prior.isEmpty()) {if(!Arrays.equals(Api.digest(auction+":"+amount),(byte[])prior.get(0).get("payload_hash")))throw new Fault(409,"IDEMPOTENCY_CONFLICT");return null;}
                Instant received=now(c);
                update(c,"INSERT INTO bid_requests(user_id,request_id,auction_id,payload_hash,received_at,amount) VALUES(?,?,?,?,?,?)",user,request,auction,Api.digest(auction+":"+amount),Timestamp.from(received),amount);
                return null;
            });
            return db.transaction(c->{lock(c,auction);var old=one(c,"SELECT state FROM bid_requests WHERE user_id=? AND request_id=?",user,request);boolean replay=!"PENDING".equals(old.get("state"));drain(c,auction);
                var saved=one(c,"SELECT response_json FROM bid_requests WHERE user_id=? AND request_id=?",user,request);
                Map<String,Object> result=org.noear.snack4.ONode.deserialize((String)saved.get("response_json"),Map.class);result.put("replayed",replay);return result;
            });
        } catch(SQLException e){if(attempt>=2||!(e.getErrorCode()==1213||e.getErrorCode()==1205||e.getErrorCode()==1062))throw e;}
    }

    private void drain(Connection c,long auction)throws SQLException {
        for(var request:rows(c,"SELECT user_id,request_id,amount,received_at FROM bid_requests WHERE auction_id=? AND state='PENDING' ORDER BY received_at,user_id,request_id",auction))
            place(c,auction,number(request,"user_id"),(String)request.get("request_id"),number(request,"amount"),Instant.parse((String)request.get("received_at")));
    }

    private Map<String,Object> place(Connection c,long auction,long user,String request,long amount,Instant received)throws SQLException {
        var a=lock(c,auction);
        byte[] hash=Api.digest(auction+":"+amount);
        var prior=rows(c,"SELECT payload_hash,response_json FROM bid_requests WHERE user_id=? AND request_id=? FOR UPDATE",user,request);
        if(!prior.isEmpty()) {
            if(!Arrays.equals(hash,(byte[])prior.get(0).get("payload_hash")))throw new Fault(409,"IDEMPOTENCY_CONFLICT");
            if(prior.get(0).get("response_json")!=null) {
                Map<String,Object> out=org.noear.snack4.ONode.deserialize((String)prior.get(0).get("response_json"),Map.class);
                out.put("replayed",true);return out;
            }
        }
        String failure=null;
        Instant end=a.get("end_at")==null?null:Instant.parse((String)a.get("end_at"));
        long current=number(a,"current_price"), increment=number(a,"min_increment"),leader=number(a,"leader_id");
        if(!"RUNNING".equals(a.get("status")))failure="INVALID_STATE";
        else if(end==null||!received.isBefore(end))failure="AUCTION_ENDED";
        else if(amount<Math.addExact(current,increment))failure="BID_TOO_LOW";
        else if(rows(c,"SELECT 1 FROM auction_participants WHERE auction_id=? AND user_id=?",auction,user).isEmpty())failure="NOT_JOINED";
        long held=0;
        if(failure==null) {
            lockWallets(c,leader==0?List.of(user):List.of(user,leader));
            held=hold(c,auction,user);
            var w=one(c,"SELECT * FROM wallets WHERE user_id=?",user);
            if(amount-held>number(w,"total_balance")-number(w,"frozen_balance"))failure="INSUFFICIENT_FUNDS";
        }
        var response=new LinkedHashMap<String,Object>();response.put("auctionId",auction);response.put("requestId",request);response.put("serverTime",received.toString());response.put("replayed",false);
        if(failure!=null) {
            response.put("type","BID_REJECTED");response.put("error",failure);
            response.put("seq",event(c,auction,"BID_REJECTED",Map.of("error",failure,"requestId",request),user));
        } else {
            String key="bid/"+user+"/"+request;
            if(leader>0&&leader!=user){long old=hold(c,auction,leader);money(c,leader,auction,request,key+"/release",0,-old);setHold(c,auction,leader,0);}
            money(c,user,auction,request,key+"/freeze",0,amount-held);setHold(c,auction,user,amount);
            faults.at("bid.afterMoney");
            boolean extend=number(a,"extension_count")<3&&!received.isBefore(end.minusSeconds(5));
            update(c,"UPDATE auctions SET current_price=?,leader_id=?,end_at=?,extension_count=extension_count+?,version=version+1 WHERE id=?",amount,user,Timestamp.from(extend?end.plusSeconds(10):end),extend?1:0,auction);
            long seq=event(c,auction,"BID_ACCEPTED",Map.of("userId",user,"amount",amount,"requestId",request));
            update(c,"INSERT INTO bids(auction_id,user_id,request_id,amount,seq,received_at) VALUES(?,?,?,?,?,?)",auction,user,request,amount,seq,Timestamp.from(received));
            if(extend)event(c,auction,"AUCTION_EXTENDED",Map.of("endAt",end.plusSeconds(10).toString()));
            response.put("type","BID_ACCEPTED");response.put("seq",seq);response.put("amount",amount);response.put("extended",extend);
        }
        update(c,"UPDATE bid_requests SET state=?,result_code=?,response_json=? WHERE user_id=? AND request_id=?",failure==null?"ACCEPTED":"REJECTED",failure==null?"BID_ACCEPTED":failure,json(response),user,request);
        return response;
    }

    public void cancel(long id)throws SQLException {finish(id,true);}
    public void settle(long id)throws SQLException {finish(id,false);}
    private void finish(long id,boolean cancel)throws SQLException {
        db.transaction(c->{one(c,"SELECT auction_id FROM auction_intake WHERE auction_id=? FOR UPDATE",id);lock(c,id);drain(c,id);var a=lock(c,id);String state=(String)a.get("status");
            if(cancel&&!Set.of("DRAFT","RUNNING").contains(state))throw new Fault(409,"INVALID_STATE");
            if(!cancel&&!("SETTLING".equals(state)||("RUNNING".equals(state)&&!now(c).isBefore(Instant.parse((String)a.get("end_at"))))))return null;
            update(c,"UPDATE auctions SET status=?,version=version+1 WHERE id=?",cancel?"CANCELLED":"SETTLING",id);
            var holds=rows(c,"SELECT user_id,amount FROM auction_holds WHERE auction_id=? AND amount>0 ORDER BY user_id",id);
            lockWallets(c,holds.stream().map(h->number(h,"user_id")).toList());
            long winner=cancel?0:number(a,"leader_id");
            for(var h:holds){long u=number(h,"user_id"),v=number(h,"amount");money(c,u,id,null,"finish/"+id+"/"+u,u==winner?-v:0,-v);setHold(c,id,u,0);}
            faults.at("settlement.afterMoney");
            update(c,"INSERT INTO auction_results(auction_id,winner_id,price,reason) VALUES(?,?,?,?)",id,winner==0?null:winner,winner==0?0:number(a,"current_price"),cancel?"CANCELLED":winner==0?"NO_BIDS":"SOLD");
            if(!cancel)update(c,"UPDATE auctions SET status='FINISHED',version=version+1 WHERE id=?",id);
            event(c,id,cancel?"AUCTION_CANCELLED":"AUCTION_FINISHED",Map.of("winnerId",winner,"price",winner==0?0:number(a,"current_price")));return null;
        });
    }
    public void tick()throws SQLException {
        List<Map<String,Object>> due;
        try(var c=db.connection()){due=rows(c,"SELECT id FROM auctions WHERE (status='RUNNING' AND end_at<=UTC_TIMESTAMP(6)) OR status='SETTLING' OR EXISTS(SELECT 1 FROM bid_requests b WHERE b.auction_id=auctions.id AND b.state='PENDING') ORDER BY id LIMIT 100");}
        for(var a:due)try{settle(number(a,"id"));}catch(SQLException failure){System.err.println("Settlement retry required for auction "+number(a,"id")+", SQLState="+failure.getSQLState());}
    }
    private static Map<String,Object> lock(Connection c,long id)throws SQLException{return one(c,"SELECT * FROM auctions WHERE id=? FOR UPDATE",id);}
    private static Instant now(Connection c)throws SQLException {try(var p=c.createStatement();var r=p.executeQuery("SELECT UTC_TIMESTAMP(6)")){r.next();return r.getTimestamp(1).toInstant();}}
    private static void lockWallets(Connection c,List<Long> users)throws SQLException {for(long id:new TreeSet<>(users))one(c,"SELECT user_id FROM wallets WHERE user_id=? FOR UPDATE",id);}
    private static long hold(Connection c,long a,long u)throws SQLException {var h=rows(c,"SELECT amount FROM auction_holds WHERE auction_id=? AND user_id=?",a,u);return h.isEmpty()?0:number(h.get(0),"amount");}
    private static void setHold(Connection c,long a,long u,long amount)throws SQLException {update(c,"INSERT INTO auction_holds(auction_id,user_id,amount) VALUES(?,?,?) ON DUPLICATE KEY UPDATE amount=VALUES(amount)",a,u,amount);}
    private static void money(Connection c,long u,long a,String req,String key,long total,long frozen)throws SQLException {
        if(total==0&&frozen==0)return;
        if(update(c,"UPDATE wallets SET total_balance=total_balance+?,frozen_balance=frozen_balance+?,version=version+1 WHERE user_id=? AND total_balance+?>=frozen_balance+? AND frozen_balance+?>=0",total,frozen,u,total,frozen,frozen)!=1)throw new Fault(409,"INSUFFICIENT_FUNDS");
        update(c,"INSERT INTO wallet_transactions(user_id,auction_id,request_id,effect_key,type,delta_total,delta_frozen,total_after,frozen_after) SELECT user_id,?,?,?,?,?,?,total_balance,frozen_balance FROM wallets WHERE user_id=?",a,req,key,total<0?"CAPTURE":frozen>0?"FREEZE":"RELEASE",total,frozen,u);
    }
    private static long event(Connection c,long id,String type,Object data)throws SQLException {
        return event(c,id,type,data,null);
    }
    private static long event(Connection c,long id,String type,Object data,Long privateUser)throws SQLException {
        update(c,"UPDATE auctions SET seq=seq+1 WHERE id=?",id);long seq=number(one(c,"SELECT seq FROM auctions WHERE id=?",id),"seq");
        update(c,"INSERT INTO auction_events(auction_id,seq,type,server_time,payload,visibility,user_id) VALUES(?,?,?,UTC_TIMESTAMP(6),?,?,?)",id,seq,type,json(data),privateUser==null?"PUBLIC":"PRIVATE",privateUser);return seq;
    }
}
