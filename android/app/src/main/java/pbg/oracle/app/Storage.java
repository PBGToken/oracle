package pbg.oracle.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;

public class Storage {
    private String DB_NAME = "MyPrefs";
    private Context context;

    Storage(Context context) {
        this.context = context;
    }

    private SharedPreferences getSharedPreferences() {
        return this.context.getSharedPreferences(this.DB_NAME, this.context.MODE_PRIVATE);
    }

    public void setStorage(String key, String data) {
        this.getSharedPreferences().edit().putString(key, data).apply();
    }

    public String getStorage(String key) {
        return this.getSharedPreferences().getString(key, "N/A");
    }

    public void clearStorage(String key) {
        this.getSharedPreferences().edit().remove(key).apply();
    }

    public void setEncryptionStorage(String key, String data) {
        try {
            // Generate encryption key
            SecretKey secretKey = generateEncryptionKey();
            byte[] iv = new byte[12]; // AES-GCM requires a 12-byte IV
            new SecureRandom().nextBytes(iv);

            // Encrypt the data
            byte[] encryptedKey = encrypt(data, secretKey, iv);

            // Save the encrypted data and IV to SharedPreferences
            SharedPreferences.Editor editor = this.getSharedPreferences().edit();
            editor.putString(key + "_encryption", Base64.encodeToString(encryptedKey, Base64.DEFAULT));
            editor.putString(key + "_iv", Base64.encodeToString(iv, Base64.DEFAULT));
            editor.apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public String getEncryptionStorage(String key) {
        try {
            // Retrieve the encrypted key and IV from SharedPreferences
            String encryptedKeyBase64 = this.getSharedPreferences().getString(key + "_encryption", "");
            String ivBase64 = this.getSharedPreferences().getString(key + "_iv", "");

            if (encryptedKeyBase64.isEmpty() || ivBase64.isEmpty()) {
                return ""; // No private key stored
            }

            // Decode the saved Base64 values
            byte[] encryptedKey = Base64.decode(encryptedKeyBase64, Base64.DEFAULT);
            byte[] iv = Base64.decode(ivBase64, Base64.DEFAULT);

            // Decrypt the private key
            SecretKey secretKey = generateEncryptionKey(); // The same key used for encryption
            return decrypt(encryptedKey, secretKey, iv); // Decrypt with the same IV and key
        } catch (Exception e) {
            e.printStackTrace();
            return e.getMessage();
        }
    }

    // Generates a secret AES key for encryption
    private SecretKey generateEncryptionKey() throws NoSuchAlgorithmException {
        KeyGenerator keyGenerator = KeyGenerator.getInstance("AES");
        keyGenerator.init(256); // 256-bit AES key
        return keyGenerator.generateKey();
    }

    // Encrypt the data using AES/GCM
    private byte[] encrypt(String data, SecretKey secretKey, byte[] iv) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        GCMParameterSpec spec = new GCMParameterSpec(128, iv); // 128-bit authentication tag length
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec);

        // Encrypt the data
        byte[] encryptedData = cipher.doFinal(data.getBytes("UTF-8"));

        // Combine the encrypted data with the authentication tag
        byte[] result = new byte[encryptedData.length];
        System.arraycopy(encryptedData, 0, result, 0, encryptedData.length);

        return result;
    }

    private String decrypt(byte[] encryptedData, SecretKey secretKey, byte[] iv) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        GCMParameterSpec spec = new GCMParameterSpec(128, iv); // 128-bit authentication tag length
        cipher.init(Cipher.DECRYPT_MODE, secretKey, spec);

        try {
            // Perform decryption
            byte[] decryptedData = cipher.doFinal(encryptedData);
            return new String(decryptedData, "UTF-8");
        } catch (Exception e) {
            e.printStackTrace();
            throw new Exception("Decryption failed. Ensure the encrypted data, key, and IV are correct.");
        }
    }

}
