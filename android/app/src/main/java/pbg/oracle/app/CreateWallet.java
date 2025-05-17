package pbg.oracle.app;

import java.util.ArrayList;
import java.util.List;
import java.util.Arrays;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.security.SecureRandom;
import java.util.Set;
import android.os.Bundle;
import android.app.Activity;
import android.app.ActionBar;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.text.InputType;
import android.util.Base64;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.view.MenuItem;
import android.view.View;
import android.view.Gravity;
import android.view.Menu;
import android.view.ViewGroup;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import androidx.annotation.NonNull;
import com.bloxbean.cardano.client.common.model.Networks;
import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.crypto.bip32.HdKeyPair;

public class CreateWallet extends Activity {

    private List<String> mnemonic;
    private Account account;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.create_wallet);

        // Set up the action bar with cancel button
        ActionBar actionBar = getActionBar();
        if (actionBar != null) {
            // Remove the back button
            actionBar.setDisplayHomeAsUpEnabled(false);
            // Show the cancel button in the action bar
            actionBar.setDisplayShowCustomEnabled(true);
            // Add cancel option to the menu
            invalidateOptionsMenu();
        }

        createLayout();

        Button pasteBtn = findViewById(R.id.copy_btn);
        pasteBtn.setText("Paste from Clipboard");
        pasteBtn.setOnClickListener(v -> pasteMnemonic());

        Button clearBtn = findViewById(R.id.regenerate);
        clearBtn.setText("Clear");
        clearBtn.setOnClickListener(v -> clearSeedInputs());

        Button confirmBtn = findViewById(R.id.create_wallet_btn);
        confirmBtn.setText("Confirm");
        confirmBtn.setOnClickListener(v -> {
            if (importWallet()) {
                Toast.makeText(this, "Wallet imported successfully!", Toast.LENGTH_SHORT).show();
                finish();
            } else {
                Toast.makeText(this, "Please enter all 24 words.", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(Menu.NONE, R.id.menu_cancel, Menu.NONE, "Cancel")
                .setShowAsAction(MenuItem.SHOW_AS_ACTION_ALWAYS);
        return true;
    }

    // this event will enable the back
    // function to the button on press
    @Override
    public boolean onOptionsItemSelected(@NonNull MenuItem item) {
        if (item.getItemId() == R.id.menu_cancel) {
            finish();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    private void createLayout() {
        LinearLayout leftLayout = findViewById(R.id.left_layout);
        LinearLayout rightLayout = findViewById(R.id.right_layout);

        for (int i = 0; i < 24; i++) {
            LinearLayout layout = insetLabelToLayout(i + 1);
            if (i < 12) {
                leftLayout.addView(layout);
            } else {
                rightLayout.addView(layout);
            }
        }
    }

    private LinearLayout insetLabelToLayout(int index) {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setBackgroundResource(R.drawable.seed_input_bg_selector);

        LinearLayout.LayoutParams layoutParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        layoutParams.setMargins(0, 8, 0, 8);
        layout.setLayoutParams(layoutParams);

        TextView indexLabel = new TextView(this);
        indexLabel.setText(index + ". ");
        indexLabel.setTextSize(16);
        indexLabel.setTypeface(null, Typeface.BOLD);
        indexLabel.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        labelParams.setMargins(8, 0, 0, 0); // margin to the left of label
        indexLabel.setLayoutParams(labelParams);

        EditText editText = new EditText(this);
        editText.setInputType(InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        editText.setBackground(null);
        editText.setTextSize(16);
        editText.setLayoutParams(new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        editText.setSingleLine();

        layout.addView(indexLabel);
        layout.addView(editText);

        // Listen to focus change to trigger selector state
        editText.setOnFocusChangeListener((v, hasFocus) -> layout.setSelected(hasFocus));

        return layout;
    }

    private void pasteMnemonic() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null && clipboard.getPrimaryClip() != null) {
            CharSequence pastedText = clipboard.getPrimaryClip().getItemAt(0).getText();
            if (pastedText != null) {
                String[] words = pastedText.toString().split("\\s+");
                if (words.length == 24) {
                    LinearLayout leftLayout = findViewById(R.id.left_layout);
                    LinearLayout rightLayout = findViewById(R.id.right_layout);
                    for (int i = 0; i < 24; i++) {
                        LinearLayout layout = (LinearLayout) (i < 12 ? leftLayout : rightLayout).getChildAt(i % 12);
                        EditText editText = (EditText) layout.getChildAt(1);
                        editText.setText(words[i]);
                    }
                } else {
                    Toast.makeText(this, "Invalid seed phrase. Must be 24 words.", Toast.LENGTH_SHORT).show();
                }
            }
        }
    }

    private void clearSeedInputs() {
        LinearLayout leftLayout = findViewById(R.id.left_layout);
        LinearLayout rightLayout = findViewById(R.id.right_layout);
        for (int i = 0; i < 24; i++) {
            LinearLayout layout = (LinearLayout) (i < 12 ? leftLayout : rightLayout).getChildAt(i % 12);
            EditText editText = (EditText) layout.getChildAt(1);
            editText.setText("");
        }
        leftLayout.getChildAt(0).requestFocus();
    }

    private boolean importWallet() {
        List<String> words = new ArrayList<>();
        LinearLayout leftLayout = findViewById(R.id.left_layout);
        LinearLayout rightLayout = findViewById(R.id.right_layout);
        for (int i = 0; i < 24; i++) {
            LinearLayout layout = (LinearLayout) (i < 12 ? leftLayout : rightLayout).getChildAt(i % 12);
            EditText editText = (EditText) layout.getChildAt(1);
            String word = editText.getText().toString().trim();
            if (word.isEmpty())
                return false;
            words.add(word);
        }

        this.mnemonic = words;
        this.account = new Account(Networks.testnet(), String.join(" ", mnemonic));
        AppState.setEncryptionStorage("mnemonic", String.join(" ", mnemonic));

        HdKeyPair hdKeyPair = this.account.hdKeyPair();
        String privateKey = Base64.encodeToString(hdKeyPair.getPrivateKey().getKeyData(), Base64.DEFAULT);
        String publicKey = Base64.encodeToString(hdKeyPair.getPublicKey().getKeyData(), Base64.DEFAULT);

        AppState.setEncryptionStorage("privateKey", privateKey);
        AppState.setEncryptionStorage("publicKey", publicKey);

        return true;
    }
}
