package pbg.oracle.app;

import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

public class AppState {
    // With `handler`, App methods on the main thread can be called from other threads
    private static Handler handler = new Handler(Looper.getMainLooper());

    private static Storage storage;
    private static int deviceID;

    // init must be called before calling other methods
    public static void init(Context context) {
        AppState.storage = new Storage(context.getApplicationContext());
        String androidId = Settings.Secure.getString(
            context.getContentResolver(),
            Settings.Secure.ANDROID_ID
        );

        if (androidId == null) {
            androidId = Build.SERIAL;
        }
        AppState.deviceID = deviceID;
    }

    public static void setInfoMessage(String info) {
        AppInfoSetter setter = new AppInfoSetter(info);
        AppState.handler.post(setter);
    }

    public static void setStorage(String key, String data) {
        AppState.storage.setStorage(key, data);
    }

    public static String getStorage(String key) {
        return AppState.storage.getStorage(key);
    }

    public static void setEncryptionStorage(String key, String data) {
        AppState.storage.setEncryptionStorage(key, data);
    }

    public static String getEncryptionStorage(String key) {
        return AppState.storage.getEncryptionStorage(key);
    }
}