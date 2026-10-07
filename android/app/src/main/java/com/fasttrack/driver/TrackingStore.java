package com.fasttrack.driver;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.util.ArrayList;
import java.util.List;

final class TrackingStore extends SQLiteOpenHelper {
    static final long RETENTION_MS = 2L * 24 * 60 * 60 * 1000;

    static final class Entry {
        long id;
        String kind;
        String payload;
        String token;
        String baseUrl;
    }

    TrackingStore(Context context) {
        super(context, "route_tracking.db", null, 1);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE queue (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, payload TEXT NOT NULL, captured_ms INTEGER NOT NULL, token TEXT NOT NULL, base_url TEXT NOT NULL)");
        db.execSQL("CREATE INDEX idx_queue_age ON queue(captured_ms)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    synchronized void enqueue(String kind, String payload, long capturedMs, String token, String baseUrl) {
        SQLiteDatabase db = getWritableDatabase();
        db.delete("queue", "captured_ms < ?", new String[] { String.valueOf(System.currentTimeMillis() - RETENTION_MS) });
        ContentValues values = new ContentValues();
        values.put("kind", kind);
        values.put("payload", payload);
        values.put("captured_ms", capturedMs);
        values.put("token", token);
        values.put("base_url", baseUrl);
        db.insertOrThrow("queue", null, values);
    }

    synchronized List<Entry> firstBatch(int max) {
        List<Entry> result = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query("queue", new String[] { "id", "kind", "payload", "token", "base_url" }, null, null, null, null, "id ASC", String.valueOf(max))) {
            while (cursor.moveToNext()) {
                Entry entry = new Entry();
                entry.id = cursor.getLong(0);
                entry.kind = cursor.getString(1);
                entry.payload = cursor.getString(2);
                entry.token = cursor.getString(3);
                entry.baseUrl = cursor.getString(4);
                if (!result.isEmpty()) {
                    Entry first = result.get(0);
                    if (!first.kind.equals(entry.kind) || !first.token.equals(entry.token) || !first.baseUrl.equals(entry.baseUrl)) break;
                }
                result.add(entry);
                if ("stop".equals(entry.kind)) break;
            }
        }
        return result;
    }

    synchronized void deleteThrough(long id) {
        getWritableDatabase().delete("queue", "id <= ?", new String[] { String.valueOf(id) });
    }

    synchronized void pruneExpired() {
        getWritableDatabase().delete("queue", "captured_ms < ?", new String[] { String.valueOf(System.currentTimeMillis() - RETENTION_MS) });
    }
}
