package pbg.oracle.app;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import javax.net.ssl.HttpsURLConnection;

public class PollingThread extends Thread {
    private PollingService service;

    PollingThread(PollingService service) {
        this.service = service;
    }

    public void run() {
        while (true) {
            String result = this.getHTTP("https://api.token.pbg.io/token/supply");
            
            AppState.setResult(result + "@" + this.now());

            try {
                Thread.sleep(10000);
            } catch (Exception e) {
                break;
            }
        }
    }

    private static String now() {
        return LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
    }

    private static String getHTTP(String urlToRead) {
        StringBuilder result = new StringBuilder();

        try {
            URL url = new URL(urlToRead);
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();

            conn.setRequestMethod("GET");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            int status = conn.getResponseCode();

            BufferedReader reader;

            if (status > 299) {
                reader = new BufferedReader(new InputStreamReader(conn.getErrorStream()));
            } else {
                reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            }
            
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