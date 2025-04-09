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

		String sdkVersion = Integer.toString(android.os.Build.VERSION.SDK_INT);

        TextView text = (TextView)findViewById(R.id.my_text);
        text.setText("SDK: " + sdkVersion);
    }
}
