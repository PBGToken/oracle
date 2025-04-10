package pbg.oracle.app;

public class AppInfoSetter implements Runnable {
    private String info;

    public AppInfoSetter(String info) {
        this.info = info;
    }

    public void run() {
        App.setInfoMessage(this.info);
    }
}