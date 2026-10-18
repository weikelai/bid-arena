package dev.bidarena;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;

/** Process-local, bounded-label operational evidence; never contains identity or credentials. */
final class Metrics {
    private final Map<String,LongAdder> counters=new ConcurrentHashMap<>();
    private final Map<String,Histogram> histograms=new ConcurrentHashMap<>();
    void increment(String name){counters.computeIfAbsent(name,k->new LongAdder()).increment();}
    void observe(String name,long nanos){histograms.computeIfAbsent(name,k->new Histogram()).observe(nanos);}
    long count(String name){var c=counters.get(name);return c==null?0:c.sum();}
    Map<String,Object> snapshot(){
        var result=new TreeMap<String,Object>();counters.forEach((k,v)->result.put(k,v.sum()));
        histograms.forEach((k,v)->result.put(k,v.snapshot()));return result;
    }
    private static final class Histogram {
        private final long[] bounds={1,5,10,50,100,500,1000,5000,15000,30000};
        private final LongAdder[] buckets=new LongAdder[bounds.length+1];
        private final LongAdder count=new LongAdder(),nanos=new LongAdder();
        Histogram(){Arrays.setAll(buckets,i->new LongAdder());}
        void observe(long value){count.increment();nanos.add(value);int i=0;while(i<bounds.length&&value>bounds[i]*1_000_000)i++;buckets[i].increment();}
        Map<String,Object> snapshot(){var out=new LinkedHashMap<String,Object>();out.put("count",count.sum());out.put("totalMs",nanos.sum()/1_000_000.0);var b=new LinkedHashMap<String,Long>();long cumulative=0;for(int i=0;i<buckets.length;i++){cumulative+=buckets[i].sum();b.put(i<bounds.length?"le"+bounds[i]+"Ms":"infinity",cumulative);}out.put("buckets",b);return out;}
    }
}
