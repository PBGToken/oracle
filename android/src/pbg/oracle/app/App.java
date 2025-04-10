package pbg.oracle.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.widget.TextView;

public class App extends Activity {
    private static TextView infoView;
    private static TextView resultView;
    private static TextView sdkVersionView;

    private static const VERSION = "development";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        this.setContentView(R.layout.activity_main);

        App.infoView = (TextView)this.findViewById(R.id.info_message);
        App.resultView = (TextView)this.findViewById(R.id.result);
        App.sdkVersionView = (TextView)this.findViewById(R.id.sdk_version);

        this.startServices();
    }

    @Override
    protected void onResume() {
        super.onResume();

        App.setSDKVersion(Integer.toString(android.os.Build.VERSION.SDK_INT));
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
