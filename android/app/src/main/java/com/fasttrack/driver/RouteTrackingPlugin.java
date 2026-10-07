package com.fasttrack.driver;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.UUID;

@CapacitorPlugin(name = "RouteTracking", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION })
})
public class RouteTrackingPlugin extends Plugin {
    static final String PREFS = "route_tracking";

    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("token");
        String motorista = call.getString("motorista");
        String baseUrl = call.getString("baseUrl");
        if (token == null || !token.matches("(?i)[0-9a-f]{64}") || motorista == null || motorista.isEmpty() || baseUrl == null || !validBaseUrl(baseUrl)) {
            call.reject("Configuração de rastreio inválida. Entre novamente no app.");
            return;
        }
        if (!hasLocationPermission()) {
            requestPermissionForAlias("location", call, "onLocationPermission");
            return;
        }
        startWithPermission(call);
    }

    @PermissionCallback
    private void onLocationPermission(PluginCall call) {
        if (!hasLocationPermission()) {
            call.reject("Permissão de localização negada.");
            return;
        }
        startWithPermission(call);
    }

    private boolean hasLocationPermission() {
        Context context = getContext();
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean validBaseUrl(String value) {
        return value.startsWith("https://") || value.startsWith("http://10.0.2.2:") || value.startsWith("http://127.0.0.1:");
    }

    private void startWithPermission(PluginCall call) {
        LocationManager manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null || (!manager.isProviderEnabled(LocationManager.GPS_PROVIDER) && !manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER))) {
            call.reject("Ative a localização do aparelho antes de iniciar o rastreio.");
            return;
        }
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String motorista = call.getString("motorista");
        if (prefs.getBoolean("active", false) && !motorista.equals(prefs.getString("motorista", ""))) {
            call.reject("Encerre a jornada do motorista anterior antes de iniciar outra.");
            return;
        }
        boolean alreadyActive = prefs.getBoolean("active", false);
        String sessionId = alreadyActive ? prefs.getString("sessionId", null) : null;
        if (sessionId == null) sessionId = UUID.randomUUID().toString();
        SharedPreferences.Editor editor = prefs.edit()
            .putBoolean("active", true)
            .putString("sessionId", sessionId)
            .putString("token", call.getString("token"))
            .putString("motorista", motorista)
            .putString("routeCode", call.getString("routeCode"))
            .putString("baseUrl", call.getString("baseUrl"));
        if (!alreadyActive) editor.putLong("lastCaptured", 0);
        editor.apply();
        try {
            ContextCompat.startForegroundService(getContext(), new Intent(getContext(), TrackingService.class).setAction(TrackingService.ACTION_START));
            JSObject result = new JSObject();
            result.put("sessionId", sessionId);
            call.resolve(result);
        } catch (Exception error) {
            prefs.edit().putBoolean("active", false).apply();
            call.reject("Não foi possível iniciar o serviço de localização.", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean("active", false)) {
            String sessionId = prefs.getString("sessionId", null);
            String token = prefs.getString("token", null);
            String baseUrl = prefs.getString("baseUrl", null);
            if (sessionId != null && token != null && baseUrl != null) {
                JSObject payload = new JSObject();
                payload.put("sessionId", sessionId);
                payload.put("stoppedAt", TrackingService.isoUtc(System.currentTimeMillis()));
                try (TrackingStore store = new TrackingStore(getContext())) {
                    store.enqueue("stop", payload.toString(), System.currentTimeMillis(), token, baseUrl);
                }
            }
            prefs.edit().putBoolean("active", false).remove("sessionId").apply();
        }
        getContext().startService(new Intent(getContext(), TrackingService.class).setAction(TrackingService.ACTION_STOP));
        call.resolve();
    }

    @PluginMethod
    public void syncPending(PluginCall call) {
        try (TrackingStore store = new TrackingStore(getContext())) {
            store.pruneExpired();
            if (store.firstBatch(1).isEmpty()) {
                call.resolve();
                return;
            }
        }
        try {
            ContextCompat.startForegroundService(getContext(), new Intent(getContext(), TrackingService.class).setAction(TrackingService.ACTION_FLUSH));
            call.resolve();
        } catch (Exception error) {
            call.reject("Não foi possível sincronizar as posições pendentes.", error);
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject result = new JSObject();
        result.put("active", prefs.getBoolean("active", false));
        result.put("motorista", prefs.getString("motorista", null));
        result.put("permission", hasLocationPermission() ? PermissionState.GRANTED.toString() : PermissionState.DENIED.toString());
        call.resolve(result);
    }
}
