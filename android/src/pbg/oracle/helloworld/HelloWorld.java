package pbg.oracle.helloworld;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.widget.TextView;

public class HelloWorld extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

		String versionInfo = "hello world";//android.os.Build.VERSION.RELEASE_OR_PREVIEW_DISPLAY;

        TextView text = (TextView)findViewById(R.id.my_text);
        text.setText("SDK: " + versionInfo);
    }
}
