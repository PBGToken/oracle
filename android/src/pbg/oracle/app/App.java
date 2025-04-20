package pbg.oracle.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

public class App extends Activity {
    private static TextView infoView;
    private static TextView resultView;
    private static TextView sdkVersionView;

    private static String VERSION = "development";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        this.setContentView(R.layout.activity_main);

        App.sdkVersionView = (TextView)this.findViewById(R.id.sdk_version);
        App.infoView = (TextView)this.findViewById(R.id.info_message);
        App.resultView = (TextView)this.findViewById(R.id.result);
        Button buttonOpenSetKeyDialog = findViewById(R.id.buttonOpenSetKeyDialog);

        buttonOpenSetKeyDialog.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                // Create an intent to navigate to CreateWallet activity
                Intent intent = new Intent(App.this, CreateWallet.class);
                startActivity(intent);  // Start the CreateWallet activity
            }
        });
        this.startServices();
    }

    @Override
    protected void onResume() {
        super.onResume();

        ((TextView)this.findViewById(R.id.app_version)).setText("App version: " + App.VERSION);
        App.setSDKVersion(Integer.toString(android.os.Build.VERSION.SDK_INT));

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        String batteryOptimization = "on";
        if (powerManager.isIgnoringBatteryOptimizations(this.getPackageName())) {
            batteryOptimization = "off";
        }

        ((TextView)this.findViewById(R.id.battery_optimization)).setText("Power restrictions: " + batteryOptimization);
    }

    public static void setInfoMessage(String message) {
        App.infoView.setText(message);
    }

    public static void setResult(String result) {
        App.resultView.setText(result);
    }

    public static void setSDKVersion(String version) {
        App.sdkVersionView.setText("Android SDK version: " + version);
    }

    private void startServices() {
        try {
            AppState.init(this);
        } catch (Exception e) {
            App.setInfoMessage("Error: " + e.getMessage());
            return;
        }

        try {
            Intent intent = new Intent(this, PollingService.class);
            
            this.startService(intent);
        } catch (Exception e) {
            App.setInfoMessage("Error: " + e.getMessage());
            return;
        }
    }
}
