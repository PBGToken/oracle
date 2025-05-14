package pbg.oracle.app;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import javax.net.ssl.HttpsURLConnection;
import android.util.Base64;
import com.upokecenter.cbor.CBORObject;
import java.security.SecureRandom;
import java.time.Instant;

public class PollingThread extends Thread {
	private PollingService service;

	PollingThread(PollingService service) {
		this.service = service;
	}

	public void run() {
		while (true) {
			String result = PollingThread.getHTTP("https://api.token.pbg.io/token/supply");

			AppState.setStorage("result", result + "@" + PollingThread.now());

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

			byte[] privateKey = Base64.decode(AppState.getEncryptionStorage("privateKey"), Base64.DEFAULT);

			if (privateKey != null && privateKey.length > 0) {
				// Generate the signature using the private key
				// String signature = Base64.encodeToString(EncryptionUtils.getSignature("deviceId".getBytes(), privateKey), Base64.NO_WRAP);
				String authToken = createAuthToken(privateKey, AppState.getDeviceID());

				conn.setRequestProperty("Authorization", authToken);
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
			}
		} catch (MalformedURLException e) {
			result.append("Error: Malformed URL - " + e.getMessage());
		} catch (IOException e) {
			result.append("IO Error: " + e.getMessage());
		} catch (Exception e) {
			result.append("Exception: " + e.getMessage());
		}

		return result.toString();
	}

	private static String createAuthToken(byte[] privateKey, int deviceId) {
        try {
            // Create nonce (timestamp + random)
            long timestamp = Instant.now().toEpochMilli();
            long random = new SecureRandom().nextInt(1000);
            long nonce = timestamp + random;

            CBORObject message = CBORObject.NewArray()
                .Add(nonce)
                .Add(deviceId);

            byte[] messageBytes = message.EncodeToBytes();
            byte[] signature = EncryptionUtils.getSignature(messageBytes, privateKey);

            CBORObject payload = CBORObject.NewArray()
                .Add(messageBytes)
                .Add(signature);

            // Convert to hex string
            return bytesToHex(payload.EncodeToBytes());
        } catch (Exception e) {
            return "";
        }
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

}