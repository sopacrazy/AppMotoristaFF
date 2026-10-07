package com.fasttrack.driver;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RouteTrackingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
