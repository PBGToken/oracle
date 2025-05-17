package pbg.oracle.app;

import android.content.Context;
import android.content.SharedPreferences;

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
            SharedPreferences.Editor editor = this.getSharedPreferences().edit();
            editor.putString(key + "_encryption", EncryptionUtils.encrypt(data));
            editor.apply();
        } catch (Exception e) {
        }
    }

    public String getEncryptionStorage(String key) {
        try {
            String encryptedKeyBase64 = this.getSharedPreferences().getString(key + "_encryption", "");
            return EncryptionUtils.decrypt(encryptedKeyBase64);
        } catch (Exception e) {
            return "N/A";
        }
    }

}
