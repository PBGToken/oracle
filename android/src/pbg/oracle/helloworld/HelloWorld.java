package pbg.oracle.helloworld;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.widget.TextView;
import java.io.*;
import java.net.*;
import javax.net.ssl.HttpsURLConnection;

public class HelloWorld extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

		String sdkVersion = Integer.toString(android.os.Build.VERSION.SDK_INT);
        String httpResponse = getHTTP("https://api.token.pbg.io/token/supply");

        TextView text = (TextView)findViewById(R.id.my_text);
        text.setText("SDK: " + sdkVersion + "\n" + httpResponse);
    }

    private static String getHTTP(String urlToRead) {
        // TODO: this doesn't work, use ApacheClient instead
        StringBuilder result = new StringBuilder();

        try {
            URL url = new URL(urlToRead);
            result.append("created url\n");

            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            result.append("created conn\n");

            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            result.append("requested\n");

            //int status = conn.getResponseCode();
            //result.append("appending status code");
            //result.append(Integer.toString(status));

            BufferedReader reader;

            //if (status > 299) {
                //reader = new BufferedReader(new InputStreamReader(conn.getErrorStream()));
            //} else {
                reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            //}

            
            String line;
            while ((line = reader.readLine()) != null) {
                result.append(line).append("\n");
            }
            reader.close();
            conn.disconnect();
             } catch (MalformedURLException e) {
            result.append("Error: Malformed URL - " + e.getMessage());
        } catch (IOException e) {
            result.append("IO Error: " + e.getMessage());
        } catch (Exception e) {
            result.append("Exception: " + e.getMessage());
        }

        return result.toString();
   }
}
