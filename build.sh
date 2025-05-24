#!/bin/bash
mkdir -p ./dist

# build page
npm run build -C ./pwa

# build android native app
#make -C ./android
#cp ./android/pbg_oracle.apk ./dist/

# TODO: build iOS app??
