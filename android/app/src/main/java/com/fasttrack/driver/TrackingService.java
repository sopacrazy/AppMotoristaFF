package com.fasttrack.driver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

public class TrackingService extends Service implements LocationListener {
    static final String ACTION_START = "com.fasttrack.driver.TRACKING_START";
    static final String ACTION_STOP = "com.fasttrack.driver.TRACKING_STOP";
    static final String ACTION_FLUSH = "com.fasttrack.driver.TRACKING_FLUSH";
    private static final String CHANNEL_ID = "route_tracking";
    private static final int NOTIFICATION_ID = 4102;
    private static final String TAG = "RouteTracking";
    private static final long SAMPLE_INTERVAL_MS = 60_000L;
    private static final long MAX_FIX_AGE_MS = 90_000L;

    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
    private TrackingStore store;
    private LocationManager locationManager;
    private SharedPreferences prefs;
    private ScheduledFuture<?> sampling;
    private volatile Location latestLocation;

    static String isoUtc(long millis) {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date(millis));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        prefs = getSharedPreferences(RouteTrackingPlugin.PREFS, Context.MODE_PRIVATE);
        store = new TrackingStore(this);
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Rastreamento da rota", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Localização durante a jornada de entregas");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        boolean starting = ACTION_START.equals(action) && prefs.getBoolean("active", false);
        if (starting) {
            try {
                ServiceCompat.startForeground(this, NOTIFICATION_ID, notification("Rastreamento da rota ativo"), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                beginSampling();
                return START_STICKY;
            } catch (Exception error) {
                Log.e(TAG, "Não foi possível iniciar o GPS", error);
                prefs.edit().putBoolean("active", false).apply();
                stopSelfResult(startId);
                return START_NOT_STICKY;
            }
        }

        if (ACTION_FLUSH.equals(action) && prefs.getBoolean("active", false)) {
            try {
                ServiceCompat.startForeground(this, NOTIFICATION_ID, notification("Rastreamento da rota ativo"), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                beginSampling();
                executor.execute(this::flushQueue);
                return START_STICKY;
            } catch (Exception error) {
                Log.e(TAG, "Não foi possível retomar o GPS", error);
                prefs.edit().putBoolean("active", false).apply();
                stopSelfResult(startId);
                return START_NOT_STICKY;
            }
        }

        stopSampling();
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification("Sincronizando posições pendentes"), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } catch (Exception error) {
            Log.e(TAG, "Não foi possível sincronizar posições pendentes", error);
            stopSelfResult(startId);
            return START_NOT_STICKY;
        }
        executor.execute(() -> {
            flushQueue();
            stopSelfResult(startId);
        });
        return START_NOT_STICKY;
    }

    private Notification notification(String message) {
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("FortFruit")
            .setContentText(message)
            .setContentIntent(pending)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build();
    }

    private void beginSampling() {
        if (sampling != null && !sampling.isCancelled()) return;
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) throw new SecurityException("Permissão de localização revogada");

        if (fine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 30_000L, 0, this, Looper.getMainLooper());
            acceptLocation(locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER));
        }
        if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30_000L, 0, this, Looper.getMainLooper());
            acceptLocation(locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER));
        }
        sampling = executor.scheduleAtFixedRate(this::sampleAndUpload, 0, SAMPLE_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }

    @Override
    public void onLocationChanged(Location location) {
        acceptLocation(location);
    }

    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}
    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}

    private void acceptLocation(Location location) {
        if (location == null) return;
        long age = Math.abs(System.currentTimeMillis() - location.getTime());
        if (age > MAX_FIX_AGE_MS || (location.hasAccuracy() && location.getAccuracy() > 200)) return;
        Location current = latestLocation;
        if (current == null || location.getTime() >= current.getTime()) latestLocation = location;
    }

    private void sampleAndUpload() {
        try {
            if (prefs.getBoolean("active", false)) {
                Location fix = latestLocation;
                long lastCaptured = prefs.getLong("lastCaptured", 0);
                if (fix != null && fix.getTime() > lastCaptured && System.currentTimeMillis() - fix.getTime() <= MAX_FIX_AGE_MS) {
                    String sessionId = prefs.getString("sessionId", null);
                    String token = prefs.getString("token", null);
                    String baseUrl = prefs.getString("baseUrl", null);
                    if (sessionId != null && token != null && baseUrl != null) {
                        JSONObject point = new JSONObject();
                        point.put("pointId", UUID.randomUUID().toString());
                        point.put("sessionId", sessionId);
                        point.put("routeCode", prefs.getString("routeCode", null));
                        point.put("capturedAt", isoUtc(fix.getTime()));
                        point.put("latitude", fix.getLatitude());
                        point.put("longitude", fix.getLongitude());
                        if (fix.hasAccuracy()) point.put("accuracy", fix.getAccuracy());
                        if (fix.hasSpeed()) point.put("speed", fix.getSpeed());
                        if (fix.hasBearing()) point.put("heading", fix.getBearing());
                        store.enqueue("point", point.toString(), fix.getTime(), token, baseUrl);
                        prefs.edit().putLong("lastCaptured", fix.getTime()).apply();
                    }
                }
            }
            flushQueue();
        } catch (Exception error) {
            Log.e(TAG, "Falha no ciclo de rastreio", error);
        }
    }

    private void flushQueue() {
        store.pruneExpired();
        for (int attempt = 0; attempt < 20; attempt++) {
            List<TrackingStore.Entry> batch = store.firstBatch(100);
            if (batch.isEmpty()) return;
            try {
                TrackingStore.Entry first = batch.get(0);
                JSONObject body;
                String endpoint;
                if ("point".equals(first.kind)) {
                    JSONArray points = new JSONArray();
                    for (TrackingStore.Entry entry : batch) points.put(new JSONObject(entry.payload));
                    body = new JSONObject().put("points", points);
                    endpoint = "/positions";
                } else {
                    body = new JSONObject(first.payload);
                    endpoint = "/stop";
                }
                int code = post(first.baseUrl + endpoint, first.token, body);
                if (code >= 200 && code < 300 || code == 400) {
                    store.deleteThrough(batch.get(batch.size() - 1).id);
                } else {
                    Log.w(TAG, "API de rastreio retornou " + code);
                    return;
                }
            } catch (Exception error) {
                Log.w(TAG, "Sem conexão para sincronizar rastreio", error);
                return;
            }
        }
    }

    private int post(String endpoint, String token, JSONObject body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setDoOutput(true);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            return connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }

    private void stopSampling() {
        if (sampling != null) {
            sampling.cancel(false);
            sampling = null;
        }
        try {
            locationManager.removeUpdates(this);
        } catch (Exception ignored) {}
        latestLocation = null;
    }

    @Override
    public void onDestroy() {
        stopSampling();
        executor.shutdownNow();
        store.close();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
