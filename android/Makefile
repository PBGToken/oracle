ANDROIDSDK=/usr/lib/android-sdk/build-tools/33.0.1
PLATFORM=/usr/lib/android-sdk/platforms/android-33/android.jar
APP=src/pbg/oracle/helloworld
NAME=pbg_oracle

CLASSES=$(patsubst %.java,%.class,$(wildcard $(APP)/*.java))

# Resources:
# https://www.hanshq.net/command-line-android.html

$(NAME).apk: dex/classes.dex AndroidManifest.xml
	aapt package -f -v -F $@ -I $(PLATFORM) -M AndroidManifest.xml -S res dex

dex/classes.dex: $(CLASSES)
	[ -e dex ] || mkdir dex
	d8 --output dex $^

$(APP)/HelloWorld.class: $(APP)/*.java $(APP)/R.java
	javac -bootclasspath $(PLATFORM) -classpath src -source 1.7 -target 1.7 $^

$(APP)/R.java: AndroidManifest.xml res/*
	aapt package -f -m -J src -S res -M AndroidManifest.xml -I $(PLATFORM)

install: $(NAME).apk
	adb install $^

clean:
	rm -vf	$(APP)/R.java \
		$(APP)/*.class \
		*.unsigned.apk \
		*.aligned.apk \
		dex/*.dex

distclean: clean
	[ ! -d dex ] || rmdir dex
	rm -vf *.apk

squeaky-clean: distclean
	@echo 'Warning! This will remove your signing keys!'
	@echo 'You have 5 seconds to press CTRL-C'
	@sleep 5
	rm -vf *.jks
