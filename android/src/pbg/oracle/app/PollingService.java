package pbg.oracle.app;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

public class PollingService extends Service {
    // a Service is started on the main thread, so we need another thread to actually perform the polling without blocking the main thread
    private PollingThread thread;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // make sure a thread is only started once per service instance
        if (this.thread == null) {
            this.thread = new PollingThread(this);   
        }

        this.thread.start();

        return Service.START_STICKY;
    }

    // Don't bind, use AppState.handler for broadcasting information to main thread instead
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
