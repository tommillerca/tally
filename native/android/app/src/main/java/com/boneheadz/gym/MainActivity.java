package com.boneheadz.gym;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HealthPlugin.class); // native Health Connect bridge (steps/calories)
        super.onCreate(savedInstanceState);
    }
}
