package pbg.oracle.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.Layout;
import android.util.Log;
import android.util.TypedValue;
import android.view.View;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.ListAdapter;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.EditText;
import android.view.Gravity;
import android.text.InputType;
import android.content.ClipboardManager;
import android.content.Context;
import android.widget.Toast;

import java.util.Arrays;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.security.SecureRandom;
import java.util.Set;
import com.bloxbean.cardano.client.account.Account;
import com.bloxbean.cardano.client.common.model.Networks;
import android.view.MenuItem;
import android.app.ActionBar;
import android.view.Menu;
import androidx.annotation.NonNull;

public class CreateWallet extends Activity {
    // Variables to store wallet seed, mnemonic code, and layout for seed words
    private Account account;
    private List<String> mnemonic;
    private LinearLayout selectedInput;

    private List<Integer> confirmInteger;
    private Integer currentLayout = null;

    // A list of editable word positions to allow users to confirm wallet words

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        this.setContentView(R.layout.create_wallet);

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

        // Set up the button to copy wallet words to clipboard
        Button copyBtn = (Button) this.findViewById(R.id.copy_wallet);
        copyBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                copyMnemonic(); // Call method to copy wallet words to clipboard
            }
        });

        // Set up the button to regenerate wallet and reset the layout
        Button regenerateBtn = (Button) this.findViewById(R.id.regenerate);
        regenerateBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                regenerateWordsLayout(); // Reset layout and regenerate wallet
                generateWallet(); // Generate a new wallet
                setSeedWordsLayout(); // Update the UI with new seed words
            }
        });

        // Set up the button to confirm wallet creation
        Button createWalletBtn = (Button) this.findViewById(R.id.create_wallet_btn);
        createWalletBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                confirmWallet(); // Proceed to wallet confirmation when clicked
            }
        });
        createLayout(); // Create the layout for seed words
        generateWallet(); // Generate wallet after layout creation
        setSeedWordsLayout(); // Set the seed words in the UI
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

    // Function to create layout with seed words (24 words)
    protected void createLayout() {
        LinearLayout leftLayout = findViewById(R.id.left_layout);
        LinearLayout rightLayout = findViewById(R.id.right_layout);
        LinearLayout leftConfirmLayout = findViewById(R.id.confirm_left_layout);
        LinearLayout rightConfirmLayout = findViewById(R.id.confirm_right_layout);
        LinearLayout leftWordsLayout = findViewById(R.id.confirm_words_left_layout);
        LinearLayout rightWordsLayout = findViewById(R.id.confirm_words_right_layout);
        if (leftLayout == null || rightLayout == null) {
            throw new NullPointerException("Layout with ID 'leftLayout' not found");
        }

        insetLabelToLayout(leftLayout, 12);
        insetLabelToLayout(rightLayout, 12);
        insetLabelToLayout(leftConfirmLayout, 2);
        insetLabelToLayout(rightConfirmLayout, 2);
        insetLabelToLayout(leftWordsLayout, 5);
        insetLabelToLayout(rightWordsLayout, 5);
    }

    // Function to insert labels and text boxes for each seed word
    protected void insetLabelToLayout(LinearLayout layout, int end) {
        for (int i = 0; i < end; i++) {
            // Create a new layout for each word
            LinearLayout labelLayout = new LinearLayout(this);
            labelLayout.setOrientation(LinearLayout.HORIZONTAL);
            LinearLayout.LayoutParams layoutParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dpToPixel(40) // Set height in pixels (converted from dp)
            );
            int marginInPx = (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                5,
                getResources().getDisplayMetrics()
            );
            layoutParams.setMargins(marginInPx, marginInPx, marginInPx, marginInPx); // Set margins for label layout
            labelLayout.setLayoutParams(layoutParams);

            // Set background, border, and corner radius for each label
            GradientDrawable drawable = new GradientDrawable();
            drawable.setShape(GradientDrawable.RECTANGLE);
            drawable.setCornerRadius(dpToPixel(20)); // Rounded corners for each label
            drawable.setColor(Color.WHITE);
            drawable.setStroke(4, Color.rgb(0, 120, 215)); // Blue border
            labelLayout.setBackground(drawable);

            // Add text and editText views for each word
            TextView textView = new TextView(this);
            LinearLayout.LayoutParams textViewParams = new LinearLayout.LayoutParams(
                    dpToPixel(30),
                    LinearLayout.LayoutParams.MATCH_PARENT);
            textView.setGravity(Gravity.CENTER);
            textView.setTextAlignment(View.TEXT_ALIGNMENT_TEXT_END);
            textView.setLayoutParams(textViewParams);

            TextView editText = new TextView(this);
            LinearLayout.LayoutParams editTextParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            editText.setBackground(null); // Remove background from EditText
            editText.setLayoutParams(editTextParams);
            editText.setEms(10);
            editText.setInputType(InputType.TYPE_CLASS_TEXT);

            // Add the word label and editText to the layout
            labelLayout.addView(textView);
            labelLayout.addView(editText);
            layout.addView(labelLayout); // Add label layout to the parent layout
        }
    }

    // Function to regenerate the wallet and reset the layout when clicked
    // 'Regenerate'
    private void regenerateWordsLayout() {
        selectedInput = null;

        ScrollView seedLayout = this.findViewById(R.id.seed_layout);
        seedLayout.setVisibility(View.VISIBLE);
        ScrollView confirmSeedLayout = this.findViewById(R.id.confirm_seed_layout);
        confirmSeedLayout.setVisibility(View.INVISIBLE);
        // Change button text and show the 'Copy' button
        Button createWalletBtn = (Button) this.findViewById(R.id.create_wallet_btn);
        createWalletBtn.setText("Next");

        Button copyBtn = (Button) this.findViewById(R.id.copy_wallet);
        copyBtn.setVisibility(View.VISIBLE); // Show copy button
        createWalletBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                confirmWallet(); // Proceed to wallet confirmation
            }
        });
    }

    // Function to copy the wallet words to clipboard
    private void copyMnemonic() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            android.content.ClipData clip = android.content.ClipData.newPlainText("Wallet Words", String.join("\n", this.mnemonic));
            clipboard.setPrimaryClip(clip); // Set the copied text to clipboard
            Toast.makeText(this, "Wallet words copied to clipboard", Toast.LENGTH_SHORT).show();
        }
    }

    // Function to confirm if the wallet words are correct
    private void confirmWallet() {
        ScrollView seedLayout = this.findViewById(R.id.seed_layout);
        seedLayout.setVisibility(View.INVISIBLE);
        ScrollView confirmSeedLayout = this.findViewById(R.id.confirm_seed_layout);
        confirmSeedLayout.setVisibility(View.VISIBLE);

        Button createWalletBtn = (Button) this.findViewById(R.id.create_wallet_btn);
        createWalletBtn.setText("Create Wallet");
        List<Integer> list = new ArrayList<>();
        for (int i = 0; i < 24; i++) {
            list.add(i); // Add all indexes of the words to editable list
        }
        Collections.shuffle(list); // Shuffle the list

        confirmInteger = new ArrayList<>(list.subList(0, 4)); // Select 4 random words
        List<Integer> showWords = new ArrayList<>(list.subList(0, 10)); // Select 10 random words

        Collections.sort(confirmInteger);
        Collections.shuffle(showWords);

        LinearLayout leftLayout = this.findViewById(R.id.confirm_left_layout);
        LinearLayout rightLayout = this.findViewById(R.id.confirm_right_layout);
        LinearLayout leftWordsLayout = this.findViewById(R.id.confirm_words_left_layout);
        LinearLayout rightWordsLayout = this.findViewById(R.id.confirm_words_right_layout);
        for (int i = 0; i < 4; i++) {
            LinearLayout layout = (LinearLayout) (i < 2 ? leftLayout : rightLayout).getChildAt(i % 2);
            if (layout == null)
                return;
            TextView numberView = (TextView) layout.getChildAt(0);
            TextView editText = (TextView) layout.getChildAt(1);
            if (numberView == null || editText == null)
                return;
            numberView.setText(String.format("%d:", confirmInteger.get(i) + 1));
            editText.setText("");
            GradientDrawable drawable = (GradientDrawable) layout.getBackground();
            drawable.setStroke(4, Color.rgb(200, 200, 200));
            layout.setBackground(drawable);
            final int finalI = i; // Effectively final variable
            layout.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    setCurrentLayout(finalI);
                }
            });
        }
        for (int i = 0; i < 10; i++) {
            LinearLayout layout = (LinearLayout) (i < 5 ? leftWordsLayout : rightWordsLayout).getChildAt(i % 5);
            if (layout == null)
                return;
            TextView numberView = (TextView) layout.getChildAt(0);
            TextView editText = (TextView) layout.getChildAt(1);
            if (numberView == null || editText == null)
                return;
            editText.setTextColor(Color.BLACK);
            String word = String.format(this.mnemonic.get(showWords.get(i)));
            editText.setText(String.format(this.mnemonic.get(showWords.get(i))));
            layout.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    LinearLayout layout = (LinearLayout) (currentLayout < 2 ? leftLayout : rightLayout)
                            .getChildAt(currentLayout % 2);
                    if (layout == null)
                        return;
                    TextView editText = (TextView) layout.getChildAt(1);
                    if (editText == null)
                        return;
                    editText.setText(word);
                    setCurrentLayout(currentLayout + 1);
                }
            });
        }
        Button copyBtn = (Button) this.findViewById(R.id.copy_wallet);
        copyBtn.setVisibility(View.INVISIBLE);
        setCurrentLayout(0);
        createWalletBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (saveWallet()) {
                    Toast.makeText(CreateWallet.this, "Seed successfully saved.", Toast.LENGTH_SHORT).show();
                    finish();
                } else {
                    Toast.makeText(CreateWallet.this, "Please enter the correct wallet words", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    // Function to check if the wallet words match
    private boolean saveWallet() {
        LinearLayout leftLayout = this.findViewById(R.id.confirm_left_layout);
        LinearLayout rightLayout = this.findViewById(R.id.confirm_right_layout);
        for (int i = 0; i < 4; i++) {
            LinearLayout layout = (LinearLayout) (i < 2 ? leftLayout : rightLayout).getChildAt(i % 2);
            if (layout == null)
                return false;
            TextView editText = (TextView) layout.getChildAt(1);
            if (editText == null)
                return false;
            String text = editText.getText().toString();
            if (!text.equals(this.mnemonic.get(confirmInteger.get(i))))
                return false;

        }
        AppState.setEncryptionStorage("mnemonic", String.join(" ", this.mnemonic));
        return true; // If all words are correct, return true
    }

    // Function to generate the wallet and mnemonic code
    private void generateWallet() {
        this.account = new Account(Networks.testnet());
        this.mnemonic = Arrays.asList(this.account.mnemonic().split(" "));
    }

    // Function to set the seed words in the layout
    private void setSeedWordsLayout() {
        LinearLayout leftLayout = this.findViewById(R.id.left_layout);
        LinearLayout rightLayout = this.findViewById(R.id.right_layout);
        for (int i = 0; i < 24; i++) {
            LinearLayout layout = (LinearLayout) (i < 12 ? leftLayout : rightLayout).getChildAt(i % 12);
            if (layout == null)
                return;
            TextView editText = (TextView) layout.getChildAt(1);
            TextView numberText = (TextView) layout.getChildAt(0);
            if (editText == null || numberText == null)
                return;
            numberText.setText(String.format("%d:", i + 1));
            editText.setText(this.mnemonic.get(i)); // Set text of EditText to seed word
        }
    }

    private void setCurrentLayout(int index) {
        if (index < 0 || 4 <= index) return;
        currentLayout = index;
        LinearLayout leftLayout = this.findViewById(R.id.confirm_left_layout);
        LinearLayout rightLayout = this.findViewById(R.id.confirm_right_layout);
        for (int i = 0; i < 4; i++) {
            LinearLayout layout = (LinearLayout) (i < 2 ? leftLayout : rightLayout).getChildAt(i % 2);
            if (layout == null)
                return;
            GradientDrawable drawable = (GradientDrawable) layout.getBackground();
            if (currentLayout == i) {
                drawable.setStroke(4, Color.rgb(0, 120, 215)); // Blue border
            } else {
                drawable.setStroke(4, Color.rgb(200, 200, 200));
            }
            layout.setBackground(drawable);
        }
    }

    // Function to convert dp to pixels
    protected int dpToPixel(int dp) {
        return (int) TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp,
            getResources().getDisplayMetrics()
        );
    }
}