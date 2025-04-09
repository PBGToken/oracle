# PBG Oracle Android App

## Approach

This project was initialized using `git clone https://gitlab.com/Matrixcoffee/hello-world-debian-android.git android`. Then the Makefile was modified to use `d8` instead of `dx` (`dx` is obsolete).

I tried using Android App Studio, but it's very slow and fails frequently. The current Makefile approach is much cleaner and faster. 

I also tried gradle, but that is equally difficult to get right, and honestly it isn't worth it to use Kotlin over Java.

The current approach is probably the cleanest and easiest to audit.

## Building

Prerequisites:
  * make
  * android-sdk with d8 (e.g. google-android-sources-33-installer)

## Emulation

Use the following guide: https://wiki.debian.org/AndroidTools:
```
sudo apt install default-jre sdkmanager
export ANDROID_HOME=/opt/android-sdk
sudo mkdir -p $ANDROID_HOME
sudo chown $USER $ANDROID_HOME
sdkmanager "emulator" "cmdline-tools;latest" "platforms;android-31" "platform-tools"
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "system-images;android-31;default;x86_64"
$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager create avd \
  --tag default --package "system-images;android-31;default;x86_64" --sdcard 64M \
  --device "Nexus 5" --name Nexus_5_API_31
/opt/android-sdk/emulator/emulator @Nexus_5_API_31
```
