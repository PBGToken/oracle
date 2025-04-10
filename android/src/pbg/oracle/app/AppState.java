package pbg.oracle.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

public class AppState {
    // With `handler`, App methods on the main thread can be called from other threads
    private static Handler handler = new Handler(Looper.getMainLooper());

    private static Storage storage;

    // init must be called before calling other methods
    public static void init(Context context) {
        AppState.storage = new Storage(context.getApplicationContext());
    }

    public static void setInfoMessage(String info) {
        AppInfoSetter setter = new AppInfoSetter(info);
        AppState.handler.post(setter);
    }

    public static String getResult() {
        return AppState.storage.getResult();
    }

    public static void setResult(String result) {
        AppState.storage.setResult(result);

        AppResultSetter setter = new AppResultSetter(result);
        AppState.handler.post(setter);
    }
}