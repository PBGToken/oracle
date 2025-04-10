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

    public String getResult() {
        return this.getSharedPreferences().getString("result", "NA");
    }
            
    public void setResult(String result) {
        this.getSharedPreferences().edit().putString("result", result).apply();
    }
}