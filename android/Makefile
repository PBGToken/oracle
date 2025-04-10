ANDROIDSDK=/usr/lib/android-sdk/build-tools/33.0.1
PLATFORM=/usr/lib/android-sdk/platforms/android-33/android.jar
APP=src/pbg/oracle/app
CLS=cls/pbg/oracle/app
NAME=pbg_oracle

CLASSES=$(patsubst $(APP)/%.java,$(CLS)/%.class,$(wildcard $(APP)/*.java))
VERSION=$(shell git rev-parse --short HEAD)

# Resources:
# https://www.hanshq.net/command-line-android.html

$(NAME).apk: $(NAME).aligned.apk keystore.jks
	apksigner sign --ks keystore.jks --ks-key-alias androidkey --ks-pass pass:android --key-pass pass:android --out $@ $<

keystore.jks:
	keytool -genkeypair -noprompt -keystore $@ -alias androidkey -validity 10000 -keyalg RSA -keysize 2048 -storepass android -keypass android

$(NAME).aligned.apk: $(NAME).unsigned.apk
	zipalign -f -p 4 $< $@

$(NAME).unsigned.apk: dex/classes.dex AndroidManifest.xml
	aapt package -f -v -F $@ -I $(PLATFORM) -M AndroidManifest.xml -S res dex

dex/classes.dex: $(CLS)/App.class
	[ -e dex ] || mkdir dex
	d8 --output dex $(CLASSES)

$(CLS)/App.java: $(APP)/*.java $(APP)/R.java	
	rm -fr cls
	cp -r src cls
	sed -i 's/\"development\"/\"$(VERSION)\"/' $(CLS)/App.java

$(CLS)/App.class: $(CLS)/App.java $(CLS)/R.java
	javac -bootclasspath $(PLATFORM) -classpath cls -source 8 -target 8 $^

$(APP)/R.java: AndroidManifest.xml res/*
	aapt package -f -m -J src -S res -M AndroidManifest.xml -I $(PLATFORM)

install: $(NAME).apk
	adb install $^

clean:
	rm -vf $(APP)/R.java \
		$(APP)/*.class \
		$(CLS)/*.class \
		$(CLS)/*.java \
		*.unsigned.apk \
		*.aligned.apk \
		dex/*.dex

distclean: clean
	[ ! -d dex ] || rmdir dex
	[ ! -d cls ] || rmdir cls
	rm -vf *.apk

squeaky-clean: distclean
	@echo 'Warning! This will remove your signing keys!'
	@echo 'You have 5 seconds to press CTRL-C'
	@sleep 5
	rm -vf *.jks
