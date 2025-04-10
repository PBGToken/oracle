package pbg.oracle.app;

public class AppResultSetter implements Runnable {
    private String result;

    public AppResultSetter(String result) {
        this.result = result;
    }

    public void run() {
        App.setResult(this.result);
    }
}