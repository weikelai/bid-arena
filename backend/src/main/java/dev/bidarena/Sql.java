package dev.bidarena;

import java.sql.*;
import java.util.*;
import org.noear.snack4.ONode;

final class Sql {
    static PreparedStatement prepare(Connection c, String sql, Object... args) throws SQLException {
        PreparedStatement p=c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
        for(int i=0;i<args.length;i++) p.setObject(i+1,args[i]);
        return p;
    }
    static int update(Connection c,String sql,Object...args)throws SQLException {
        try(var p=prepare(c,sql,args)){return p.executeUpdate();}
    }
    static List<Map<String,Object>> rows(Connection c,String sql,Object...args)throws SQLException {
        try(var p=prepare(c,sql,args);var r=p.executeQuery()) {
            var out=new ArrayList<Map<String,Object>>(); var m=r.getMetaData();
            while(r.next()) {var row=new LinkedHashMap<String,Object>();for(int i=1;i<=m.getColumnCount();i++) {
                Object v=r.getObject(i);if(v instanceof Timestamp t)v=t.toInstant().toString();
                if(v instanceof java.time.LocalDateTime t)v=t.toInstant(java.time.ZoneOffset.UTC).toString();
                row.put(m.getColumnLabel(i),v);
            }out.add(row);}return out;
        }
    }
    static Map<String,Object> one(Connection c,String sql,Object...args)throws SQLException {
        var rows=rows(c,sql,args);if(rows.isEmpty())throw new Fault(404,"NOT_FOUND");return rows.get(0);
    }
    static long number(Map<String,Object> row,String key){Object v=row.get(key);return v==null?0:((Number)v).longValue();}
    static String json(Object value){return ONode.serialize(value);}
    static final class Fault extends RuntimeException {
        final int status; final String code;
        Fault(int status,String code){super(code);this.status=status;this.code=code;}
    }
}
