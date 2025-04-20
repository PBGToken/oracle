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
import android.widget.Switch;
import android.widget.TextView;
import android.widget.EditText;
import android.view.Gravity;
import android.text.InputType;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import android.content.ClipboardManager;
import android.content.Context;
import android.widget.Toast;
import org.bitcoinj.wallet.DeterministicSeed;
import org.bitcoinj.crypto.HDKeyDerivation;
import java.util.List;
import java.security.SecureRandom;
import java.util.Set;
import org.bitcoinj.crypto.DeterministicKey;
import org.w3c.dom.Text;

// Enum to represent Seed Types, either 12 or 24 words
enum SeedType {
    TWELVE(12),
    TWENTY_FOUR(24);

    private final int value;

    SeedType(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }
}

public class CreateWallet extends Activity {
    // Variables to store wallet seed, mnemonic code, and layout for seed words
    private DeterministicSeed seed;
    private List<String> mnemonicCode;
    private List<LinearLayout> labelLayouts;

    // A list of editable word positions to allow users to confirm wallet words
    private List<Integer> editableList = new ArrayList<>();

    // Default seed type is set to 12 words
    private SeedType seedType = SeedType.TWELVE;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            // Generate entropy (random bytes) for wallet creation
            byte[] entropy = new byte[32];
            new SecureRandom().nextBytes(entropy);
            // Create seed using entropy and set the mnemonic code (words)
            seed = new DeterministicSeed(entropy, "", System.currentTimeMillis() / 1000);
            this.mnemonicCode = seed.getMnemonicCode();
        } catch (Exception e) {
            // Show an error if seed generation fails and finish the activity
            Toast.makeText(this, "Error generating wallet seed", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        labelLayouts = new java.util.ArrayList<>();
        this.setContentView(R.layout.create_wallet);

        // Set up the button to copy wallet words to clipboard
        Button copyBtn = (Button)this.findViewById(R.id.copy_wallet);
        copyBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                copyWalletWords(); // Call method to copy wallet words to clipboard
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
        Button createWalletBtn = (Button)this.findViewById(R.id.create_wallet_btn);
        createWalletBtn.setOnClickListener(new View.OnClickListener(){
            @Override
            public  void onClick(View v) {
                confirmWallet(); // Proceed to wallet confirmation when clicked
            }
        });

        // Switch to toggle between 12 and 24 word seed types
        Switch seedTypeSwitch = (Switch) this.findViewById(R.id.seedTypeSwitch);
        seedTypeSwitch.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                changeSeedType(isChecked ? SeedType.TWENTY_FOUR : SeedType.TWELVE); // Update seed type
            }
        });

        // Text views to switch between 12 and 24 word options
        TextView _12Words = (TextView) this.findViewById(R.id._12words);
        _12Words.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                seedTypeSwitch.setChecked(false); // Switch to 12 words
            }
        });
        TextView _24Words = (TextView) this.findViewById(R.id._24words);
        _24Words.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                seedTypeSwitch.setChecked(true); // Switch to 24 words
            }
        });
        seedTypeSwitch.setChecked(seedType == SeedType.TWENTY_FOUR);

        createLayout(); // Create the layout for seed words
        generateWallet(); // Generate wallet after layout creation
        setSeedWordsLayout(); // Set the seed words in the UI
    }

    // Method to change seed type (12 or 24 words)
    protected void changeSeedType(SeedType seedType) {
        if(this.seedType == seedType) return;
        this.seedType = seedType;

        // Remove all views from left and right layouts
        LinearLayout leftLayout = (LinearLayout) this.findViewById(R.id.leftLayout);
        leftLayout.removeAllViews();
        LinearLayout rightLayout = (LinearLayout) this.findViewById(R.id.rightLayout);
        rightLayout.removeAllViews();
        labelLayouts.clear(); // Clear the list of layouts for new word placements

        createLayout(); // Re-create layout based on the new seed type
        generateWallet(); // Regenerate the wallet based on new seed type
        setSeedWordsLayout(); // Set seed words in the layout
    }

    // Function to create layout with seed words (12 or 24 words)
    protected void createLayout() {
        LinearLayout leftLayout = findViewById(R.id.leftLayout);
        LinearLayout rightLayout = findViewById(R.id.rightLayout);
        if (leftLayout == null || rightLayout == null) {
            throw new NullPointerException("Layout with ID 'leftLayout' not found");
        }

        insetLabelToLayout(leftLayout, 0); // Insert first 12 words into left layout
        insetLabelToLayout(rightLayout, seedType == SeedType.TWELVE ? 6 : 12); // Insert remaining words into right layout
    }

    // Function to insert labels and text boxes for each seed word
    protected void insetLabelToLayout(LinearLayout layout, int start) {
        for (int i = start; i < start + (seedType == SeedType.TWELVE ?  6 : 12); i ++) {
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
                    LinearLayout.LayoutParams.MATCH_PARENT
            );
            textView.setGravity(Gravity.CENTER);
            textView.setTextAlignment(View.TEXT_ALIGNMENT_TEXT_END);
            textView.setLayoutParams(textViewParams);
            textView.setText(String.format("%d:", i + 1));

            EditText editText = new EditText(this);
            LinearLayout.LayoutParams editTextParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            editText.setBackground(null); // Remove background from EditText
            editText.setLayoutParams(editTextParams);
            editText.setEms(10);
            editText.setInputType(InputType.TYPE_CLASS_TEXT);
            editText.setEnabled(false); // Disable editing initially

            // Add the word label and editText to the layout
            labelLayout.addView(textView);
            labelLayout.addView(editText);
            labelLayouts.add(labelLayout); // Add the label layout to the list
            layout.addView(labelLayout); // Add label layout to the parent layout
        }
    }

    // Function to regenerate the wallet and reset the layout when clicked 'Regenerate'
    private void regenerateWordsLayout() {
        for (int i = 0; i < (seedType == SeedType.TWELVE ? 12 : 24); i++) {
            LinearLayout layout = labelLayouts.get(i);
            EditText editText = (EditText)layout.getChildAt(1);
            editText.setEnabled(false);
            editText.setText(""); // Clear text in the EditText field
            Drawable bg = layout.getBackground();
            if (bg instanceof GradientDrawable) {
                GradientDrawable drawable = (GradientDrawable) bg;
                drawable.setColor(Color.WHITE); // Reset background color
            }
        }

        // Change button text and show the 'Copy' button
        Button createWalletBtn = (Button)this.findViewById(R.id.create_wallet_btn);
        createWalletBtn.setText("Next");

        Button copyBtn = (Button)this.findViewById(R.id.copy_wallet);
        copyBtn.setVisibility(View.VISIBLE); // Show copy button
        createWalletBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public  void onClick(View v) {
                confirmWallet(); // Proceed to wallet confirmation
            }
        });
    }

    // Function to copy the wallet words to clipboard
    private void copyWalletWords() {
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            android.content.ClipData clip = android.content.ClipData.newPlainText("Wallet Words", String.join(" ", mnemonicCode));
            clipboard.setPrimaryClip(clip); // Set the copied text to clipboard
            Toast.makeText(this, "Wallet words copied to clipboard", Toast.LENGTH_SHORT).show();
        }
    }

    // Function to confirm if the wallet words are correct
    private void confirmWallet() {
        Button createWalletBtn = (Button)this.findViewById(R.id.create_wallet_btn);
        createWalletBtn.setText("Create Wallet");
        for (int i = 0; i < (seedType == SeedType.TWELVE ? 12 : 24); i++) {
            editableList.add(i); // Add all indexes of the words to editable list
        }
        Collections.shuffle(editableList); // Shuffle the list
        List<Integer> selected = editableList.subList(0, 4); // Select 4 words to edit

        Set<Integer> editable = new HashSet<>(selected); // Use a set for fast lookup

        // Apply styles to the words to be edited
        for (int i = 0; i < (seedType == SeedType.TWELVE ? 12 : 24); i++) {
            LinearLayout layout = labelLayouts.get(i);
            EditText editText = (EditText)layout.getChildAt(1);
            editText.setText(""); // Clear the text in the EditText field
            Drawable bg = layout.getBackground();
            if (bg instanceof GradientDrawable) {
                GradientDrawable drawable = (GradientDrawable) bg;
                if (!editable.contains(i)) {
                    drawable.setColor(Color.rgb(200, 200, 200)); // Grey out non-editable words
                    editText.setEnabled(false);
                } else {
                    drawable.setColor(Color.WHITE); // Allow editing of selected words
                    editText.setEnabled(true);
                }
            }
        }

        // Hide the copy button and proceed with wallet confirmation
        Button copyBtn = (Button)this.findViewById(R.id.copy_wallet);
        copyBtn.setVisibility(View.INVISIBLE);
        createWalletBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (saveWallet()) {
                    Toast.makeText(CreateWallet.this, "Wallet successfully created", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(CreateWallet.this, "Please enter the correct wallet words", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    // Function to check if the wallet words match
    private boolean saveWallet() {
        for (int i = 0; i < editableList.size(); i++) {
            int index = editableList.get(i);
            LinearLayout layout = labelLayouts.get(index);
            if (layout != null && layout.getChildCount() >= 2) {
                EditText editText = (EditText) layout.getChildAt(1);
                String userInput = editText.getText().toString().trim();
                String correctWord = mnemonicCode.get(index);
                Log.d("WalletConfirmation", "Index: " + i + ", User Input: " + userInput + ", Correct Word: " + correctWord);

                if (!userInput.equals(correctWord)) {
                    return false; // If any word is incorrect, return false
                }
            }
        }
        return true; // If all words are correct, return true
    }

    // Function to generate the wallet and mnemonic code
    private void generateWallet() {
        try {

            byte[] entropy;
            if(seedType == SeedType.TWELVE) {
                entropy = new byte[16];
            }else {
                entropy = new byte[32];
            }
            new SecureRandom().nextBytes(entropy); // Generate random entropy
            DeterministicSeed seed = new DeterministicSeed(entropy, "", System.currentTimeMillis() / 1000); // Generate the seed
            this.mnemonicCode = seed.getMnemonicCode(); // Get the mnemonic code (wallet words)
        } catch (Exception e) {
            // If error, show a toast and finish the activity
            Toast.makeText(this, "Error generating wallet", Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    // Function to get the private key from the seed
    private String getPrivateKey() {
        DeterministicKey key = HDKeyDerivation.createMasterPrivateKey(seed.getSeedBytes());
        BigInteger privateKeyBigInt = key.getPrivKey(); // Get private key as BigInteger
        String privateKeyHex = privateKeyBigInt.toString(16); // Convert BigInteger to hex string
        return privateKeyHex;
    }

    // Function to set the seed words in the layout
    private void setSeedWordsLayout() {
        LinearLayout leftLayout = (LinearLayout) this.findViewById(R.id.leftLayout);
        for (int i = 0 ; i < (seedType == SeedType.TWELVE ? 6 : 12); i ++) {
            LinearLayout layout = (LinearLayout) leftLayout.getChildAt(i);
            if(layout == null) return;
            EditText editText = (EditText) layout.getChildAt(1);
            if (editText == null) return;
            editText.setText(this.mnemonicCode.get(i)); // Set text of EditText to seed word
        }
        LinearLayout rightLayout = (LinearLayout) this.findViewById(R.id.rightLayout);
        for (int i = 0; i < (seedType == SeedType.TWELVE ? 6 : 12); i ++) {
            LinearLayout layout = (LinearLayout) rightLayout.getChildAt(i);
            if(layout == null) return;
            EditText editText = (EditText) layout.getChildAt(1);
            if (editText == null) return;
            editText.setText(this.mnemonicCode.get(i + (seedType == SeedType.TWELVE ? 6 : 12))); // Set second half of words
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
